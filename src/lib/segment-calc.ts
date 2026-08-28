/**
 * 구간(장소→장소) 이동 계산의 클라이언트 공용 로직.
 * 자동 계산(auto-transit)과 타임라인의 모드 오버라이드가 함께 사용한다.
 *
 * - walk: 거리 근사 (무료·오프라인) — 정밀 경로가 필요한 곳에서만 구글 SDK 병용
 * - transit: 브라우저 엔진 우선 → 서버 폴백
 * - taxi: 구글 Routes API (서버 액션)
 */
import type { Place, TransportMode, TransitStep } from "./types";
import type { TransitPath, TransitResult } from "./engine/geo";
import { distanceMeters, walkSecsForMeters } from "./engine/geo";
import { computeTransitLocal, computeTransitOptionsLocal } from "./client-transit";
import { fetchDirections, fetchTransitOptions } from "./actions/directions";
import type { TransitOptionsResponse } from "./engine/plan";

/** 이 거리 미만이면 자동 계산 기본 모드를 도보로 */
export const AUTO_WALK_THRESHOLD_M = 800;

export interface SegmentResult {
  mode: TransportMode;
  minutes: number;
  steps?: TransitStep[];
  paths?: TransitPath[];
}

export type SegmentResponse =
  | { ok: true; data: SegmentResult }
  | { ok: false; error: string };

export function segmentDistanceMeters(from: Place, to: Place): number {
  return distanceMeters(from.lat, from.lng, to.lat, to.lng);
}

/** 도보 거리 근사 — 네트워크 불필요 */
export function walkEstimate(from: Place, to: Place): SegmentResult {
  const meters = segmentDistanceMeters(from, to);
  return {
    mode: "walk",
    minutes: Math.max(1, Math.ceil(walkSecsForMeters(meters) / 60)),
  };
}

/** 예외를 던지지 않는다 — 서버 액션 rejection 등은 {ok:false}로 정규화 (호출부 try/catch 불필요) */
export async function computeSegment(
  mode: TransportMode,
  from: Place,
  to: Place,
  departureHour: number,
  travelDate?: string
): Promise<SegmentResponse> {
  try {
    return await computeSegmentInner(mode, from, to, departureHour, travelDate);
  } catch {
    return { ok: false, error: "경로 계산 중 네트워크 오류가 발생했습니다." };
  }
}

async function computeSegmentInner(
  mode: TransportMode,
  from: Place,
  to: Place,
  departureHour: number,
  travelDate?: string
): Promise<SegmentResponse> {
  if (mode === "walk") {
    return { ok: true, data: walkEstimate(from, to) };
  }

  if (mode === "transit") {
    const local = await computeTransitLocal(
      from.lat, from.lng, to.lat, to.lng, departureHour, travelDate
    );
    const result =
      local ??
      (await fetchDirections(from.lat, from.lng, to.lat, to.lng, "transit", departureHour, travelDate));
    if (!result.ok) return result;
    return {
      ok: true,
      data: {
        mode: "transit",
        minutes: result.data.durationMinutes,
        steps: result.data.steps,
        paths: "paths" in result.data ? result.data.paths : undefined,
      },
    };
  }

  // taxi
  const result = await fetchDirections(
    from.lat, from.lng, to.lat, to.lng, "driving", departureHour, travelDate
  );
  if (!result.ok) return result;
  return { ok: true, data: { mode: "taxi", minutes: result.data.durationMinutes } };
}

/** 자동 계산의 기본 모드 — 거리 기반 */
export function autoMode(from: Place, to: Place): TransportMode {
  return segmentDistanceMeters(from, to) < AUTO_WALK_THRESHOLD_M ? "walk" : "transit";
}

export type { TransitResult };

/** 전철 대안 경로 목록 — 브라우저 엔진 우선, 서버 폴백. 예외를 던지지 않음 */
export async function computeSegmentOptions(
  from: Place,
  to: Place,
  departureHour: number,
  travelDate?: string
): Promise<TransitOptionsResponse> {
  try {
    const local = await computeTransitOptionsLocal(
      from.lat, from.lng, to.lat, to.lng, departureHour, travelDate
    );
    return (
      local ??
      (await fetchTransitOptions(from.lat, from.lng, to.lat, to.lng, departureHour, travelDate))
    );
  } catch {
    return { ok: false, error: "경로 계산 중 네트워크 오류가 발생했습니다." };
  }
}
