"use server";

export type TravelMode = "walking" | "transit" | "driving";

interface DirectionsResult {
  durationMinutes: number;
  summary: string; // 경로 요약 (예: "都道317号線")
}

type DirectionsResponse =
  | { ok: true; data: DirectionsResult }
  | { ok: false; error: string };

export async function fetchDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: TravelMode
): Promise<DirectionsResponse> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { ok: false, error: "API 키가 없습니다." };

  const modeParam =
    mode === "walking" ? "walking" : mode === "transit" ? "transit" : "driving";

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${originLat},${originLng}`);
  url.searchParams.set("destination", `${destLat},${destLng}`);
  url.searchParams.set("mode", modeParam);
  url.searchParams.set("language", "ko");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return { ok: false, error: `API 오류 (${res.status})` };

    const json = await res.json();
    if (json.status !== "OK") {
      return { ok: false, error: `경로 없음 (${json.status})` };
    }

    const leg = json.routes[0]?.legs[0];
    if (!leg) return { ok: false, error: "경로를 찾을 수 없습니다." };

    return {
      ok: true,
      data: {
        durationMinutes: Math.ceil(leg.duration.value / 60),
        summary: json.routes[0].summary || "",
      },
    };
  } catch {
    return { ok: false, error: "네트워크 오류가 발생했습니다." };
  }
}
