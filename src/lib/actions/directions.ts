"use server";

import type { TransitStep } from "@/lib/types";
import type { TransitPath } from "@/lib/engine/geo";
import { computeTransitRoute } from "@/lib/engine-server";

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
  departureHour: number
): Promise<DirectionsResponse> {
  const result = computeTransitRoute(originLat, originLng, destLat, destLng, departureHour);
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      durationMinutes: result.data.durationMinutes,
      steps: result.data.steps,
      paths: result.data.paths,
    },
  };
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

export async function fetchDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode,
  departureHour: number
): Promise<DirectionsResponse> {
  if (mode === "transit") {
    return fetchTransitEngine(originLat, originLng, destLat, destLng, departureHour);
  }
  return fetchGoogleRoutes(originLat, originLng, destLat, destLng, mode, departureHour);
}
