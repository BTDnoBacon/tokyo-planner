"use server";

import type { TransitStep } from "@/lib/types";

export type TravelMode = "walking" | "transit" | "driving";

interface DirectionsResult {
  durationMinutes: number;
  steps?: TransitStep[];
}

type DirectionsResponse =
  | { ok: true; data: DirectionsResult }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNavitimeSections(sections: any[]): TransitStep[] {
  const steps: TransitStep[] = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (sec.type !== "move") continue;

    if (sec.move === "walk") {
      steps.push({ type: "walk", lineName: "도보", minutes: sec.time });
      continue;
    }

    // 열차 구간 — 다음 point에서 도착역 이름 추출
    const nextPoint = sections[i + 1];
    const prevPoint = sections[i - 1];
    steps.push({
      type: "train",
      lineName: sec.line_name,
      fromStation: prevPoint?.name && prevPoint.name !== "start" ? prevPoint.name : undefined,
      toStation: nextPoint?.name && nextPoint.name !== "goal" ? nextPoint.name : undefined,
      minutes: sec.time,
      color: sec.transport?.color,
    });
  }
  return steps;
}

async function fetchTransitNavitime(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number
): Promise<DirectionsResponse> {
  const apiKey = process.env.NAVITIME_API_KEY;
  if (!apiKey) return { ok: false, error: "NAVITIME API 키가 없습니다." };

  const d = new Date();
  d.setHours(departureHour, 0, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(departureHour)}:00:00`;

  const url = new URL("https://navitime-route-totalnavi.p.rapidapi.com/route_transit");
  url.searchParams.set("start", `${originLat},${originLng}`);
  url.searchParams.set("goal", `${destLat},${destLng}`);
  url.searchParams.set("start_time", startTime);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "x-rapidapi-host": "navitime-route-totalnavi.p.rapidapi.com",
        "x-rapidapi-key": apiKey,
      },
      cache: "no-store",
    });

    if (!res.ok) return { ok: false, error: `NAVITIME API 오류 (${res.status})` };

    const json = await res.json();
    const item = json.items?.[0];
    if (!item) return { ok: false, error: "경로를 찾을 수 없습니다." };

    return {
      ok: true,
      data: {
        durationMinutes: item.summary.move.time,
        steps: parseNavitimeSections(item.sections),
      },
    };
  } catch {
    return { ok: false, error: "네트워크 오류가 발생했습니다." };
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

export async function fetchDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode,
  departureHour: number
): Promise<DirectionsResponse> {
  if (mode === "transit") {
    return fetchTransitNavitime(originLat, originLng, destLat, destLng, departureHour);
  }
  return fetchGoogleRoutes(originLat, originLng, destLat, destLng, mode, departureHour);
}
