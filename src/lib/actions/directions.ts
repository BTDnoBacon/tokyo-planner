"use server";

import type { TransitStep } from "@/lib/types";
import type { TransitPath } from "@/lib/engine/geo";
import { computeTransitRoute, computeTransitOptions, computeTransitDepartures } from "@/lib/engine-server";
import type { TransitOptionsResponse } from "@/lib/engine-server";

export type TravelMode = "walking" | "transit" | "driving";

interface DirectionsResult {
  durationMinutes: number;
  steps?: TransitStep[];
  /** 전철 구간 폴리라인 (지도 표시용) */
  paths?: TransitPath[];
}

type DirectionsResponse =
  | { ok: true; data: DirectionsResult }
  | { ok: false; error: string };

/** 자체 RAPTOR 엔진 (TokyoGTFS) — NAVITIME 대체 */
async function fetchTransitEngine(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number,
  travelDate?: string
): Promise<DirectionsResponse> {
  try {
    const result = computeTransitRoute(
      originLat, originLng, destLat, destLng, departureHour, travelDate
    );
    if (!result.ok) return result;
    return {
      ok: true,
      data: {
        durationMinutes: result.data.durationMinutes,
        steps: result.data.steps,
        paths: result.data.paths,
      },
    };
  } catch (err) {
    console.error("transit engine error:", err);
    return { ok: false, error: "경로 계산 중 오류가 발생했습니다." };
  }
}

async function fetchGoogleRoutes(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: "walking" | "driving",
  departureHour: number
): Promise<DirectionsResponse> {
  const apiKey = process.env.GOOGLE_DIRECTIONS_API_KEY;
  if (!apiKey) return { ok: false, error: "Directions API 키가 없습니다." };

  const d = new Date();
  d.setHours(departureHour, 0, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);

  const body = {
    origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
    destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
    travelMode: mode === "walking" ? "WALK" : "DRIVE",
    departureTime: d.toISOString(),
  };

  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `API 오류 (${res.status}): ${errText.slice(0, 100)}` };
    }

    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) return { ok: false, error: "경로를 찾을 수 없습니다." };

    const seconds = parseFloat(String(route.duration).replace("s", ""));
    return { ok: true, data: { durationMinutes: Math.ceil(seconds / 60) } };
  } catch {
    return { ok: false, error: "네트워크 오류가 발생했습니다." };
  }
}

/** 전철 대안 경로 목록 (자체 엔진) — Web Worker 실패 시의 서버 폴백 */
export async function fetchTransitOptions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number,
  travelDate?: string
): Promise<TransitOptionsResponse> {
  try {
    return computeTransitOptions(originLat, originLng, destLat, destLng, departureHour, travelDate);
  } catch (err) {
    console.error("transit options error:", err);
    return { ok: false, error: "경로 계산 중 오류가 발생했습니다." };
  }
}

/** 출발 시간대 프로필 (rRAPTOR, 자체 엔진) — Web Worker 실패 시의 서버 폴백 */
export async function fetchTransitDepartures(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureMinutes: number,
  travelDate?: string
): Promise<TransitOptionsResponse> {
  try {
    return computeTransitDepartures(originLat, originLng, destLat, destLng, departureMinutes, travelDate);
  } catch (err) {
    console.error("transit departures error:", err);
    return { ok: false, error: "경로 계산 중 오류가 발생했습니다." };
  }
}

export async function fetchDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode,
  departureHour: number,
  /** 여행 날짜 "YYYY-MM-DD" — transit 캘린더(평일/주말) 반영용. 없으면 오늘/내일 */
  travelDate?: string
): Promise<DirectionsResponse> {
  if (mode === "transit") {
    return fetchTransitEngine(originLat, originLng, destLat, destLng, departureHour, travelDate);
  }
  return fetchGoogleRoutes(originLat, originLng, destLat, destLng, mode, departureHour);
}
