/**
 * 좌표 기반 transit 질의의 공통 로직 (브라우저 안전 — Node API 없음).
 * 서버(engine-server.ts)와 Web Worker(worker.ts)가 같은 코드를 사용한다.
 */
import type { Timetable } from "./types";
import { route as raptor } from "./raptor";
import { activeServices } from "./calendar";
import {
  nearbyPlatforms,
  journeyToResult,
  distanceMeters,
  walkSecsForMeters,
  type TransitResult,
} from "./geo";

/** Pareto 후보 중 선택 가중치 — 환승 1회당 이 분만큼 도착이 늦은 것으로 간주 */
const TRANSFER_PENALTY_MIN = 3;
/** 출발지→도착지 직접 도보 폴백 상한 */
const WALK_FALLBACK_MAX_M = 2000;

export type TransitRouteResponse =
  | { ok: true; data: TransitResult }
  | { ok: false; error: string };

/** 대안 포함 응답 — data[0]이 추천 경로 */
export type TransitOptionsResponse =
  | { ok: true; data: TransitResult[] }
  | { ok: false; error: string };

/** 표시할 최대 대안 수 */
const MAX_OPTIONS = 4;

/** JST 기준 오늘 날짜(YYYYMMDD)와 현재 초 */
function nowJst(): { date: number; secs: number } {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return {
    date: jst.getUTCFullYear() * 10000 + (jst.getUTCMonth() + 1) * 100 + jst.getUTCDate(),
    secs: jst.getUTCHours() * 3600 + jst.getUTCMinutes() * 60,
  };
}

function addDays(date: number, days: number): number {
  const y = Math.floor(date / 10000);
  const m = Math.floor((date % 10000) / 100);
  const d = date % 100;
  const next = new Date(Date.UTC(y, m - 1, d) + days * 24 * 3600 * 1000);
  return next.getUTCFullYear() * 10000 + (next.getUTCMonth() + 1) * 100 + next.getUTCDate();
}

function walkOnlyResult(meters: number, departureSecs: number): TransitResult {
  const walkSecs = walkSecsForMeters(meters);
  const minutes = Math.max(1, Math.ceil(walkSecs / 60));
  return {
    steps: [{ type: "walk", lineName: "도보", minutes }],
    paths: [],
    startSecs: departureSecs,
    endSecs: departureSecs + walkSecs,
    durationMinutes: minutes,
    transfers: 0,
  };
}

/** 추천 경로 1개 (기존 API — planTransitOptions의 첫 옵션) */
export function planTransit(
  tt: Timetable,
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number,
  travelDate?: string
): TransitRouteResponse {
  const result = planTransitOptions(tt, originLat, originLng, destLat, destLng, departureHour, travelDate);
  return result.ok ? { ok: true, data: result.data[0] } : result;
}

/** Pareto 대안 포함 전체 경로 — data[0]이 추천 (도착시각+환승 페널티 최소) */
export function planTransitOptions(
  tt: Timetable,
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number,
  /** 여행 날짜 "YYYY-MM-DD" — 없으면 오늘(지났으면 내일) */
  travelDate?: string
): TransitOptionsResponse {
  const sources = nearbyPlatforms(tt, originLat, originLng);
  const targets = nearbyPlatforms(tt, destLat, destLng);
  if (sources.length === 0) return { ok: false, error: "출발지 주변 3km 내에 역이 없습니다." };
  if (targets.length === 0) return { ok: false, error: "도착지 주변 3km 내에 역이 없습니다." };

  let date: number;
  if (travelDate) {
    date = Number(travelDate.replaceAll("-", ""));
  } else {
    const now = nowJst();
    date = departureHour * 3600 <= now.secs ? addDays(now.date, 1) : now.date;
  }
  // 심야(0~3시)는 전날 서비스일의 24h+ 시각으로 표현 (GTFS 규약)
  let departureSecs = departureHour * 3600;
  if (departureHour < 4) {
    date = addDays(date, -1);
    departureSecs += 24 * 3600;
  }
  if (activeServices(tt.services, date).size === 0) {
    return { ok: false, error: "해당 날짜의 시간표가 없습니다 (데이터 갱신 필요)." };
  }

  const directMeters = distanceMeters(originLat, originLng, destLat, destLng);

  // 도보 leg 없는 퇴화 케이스(출발·도착이 같은 역 등) 제외
  const journeys = raptor(tt, {
    sources: sources.map(({ stop, walkSecs }) => ({ stop, offsetSecs: walkSecs })),
    targets: targets.map(({ stop, walkSecs }) => ({ stop, offsetSecs: walkSecs })),
    departureSecs,
    date,
  }).filter((j) => j.legs.length > 0);

  if (journeys.length === 0) {
    if (directMeters <= WALK_FALLBACK_MAX_M) {
      return { ok: true, data: [walkOnlyResult(directMeters, departureSecs)] };
    }
    return { ok: false, error: "경로를 찾을 수 없습니다." };
  }

  // "도착시각 + 환승 페널티" 오름차순 = 추천 순
  // (arrivalSecs는 이탈 도보 offset을 이미 포함 — 추가 가산 금지)
  const sourceOffset = new Map(sources.map((s) => [s.stop, s.walkSecs]));
  const targetOffset = new Map(targets.map((s) => [s.stop, s.walkSecs]));
  const ranked = journeys
    .map((j) => ({ j, score: j.arrivalSecs + j.transfers * TRANSFER_PENALTY_MIN * 60 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_OPTIONS);

  const options = ranked.map(({ j }) => {
    const access = sourceOffset.get(j.legs[0].fromStop) ?? 0;
    const egress = targetOffset.get(j.legs[j.legs.length - 1].toStop) ?? 0;
    return journeyToResult(tt, j, access, egress);
  });

  // 도보가 최선 경로보다 빠른 초근거리면 도보를 추천(첫 옵션)으로
  if (directMeters <= WALK_FALLBACK_MAX_M) {
    const walkArrival = departureSecs + walkSecsForMeters(directMeters);
    if (walkArrival <= ranked[0].j.arrivalSecs) {
      options.unshift(walkOnlyResult(directMeters, departureSecs));
    }
  }

  return { ok: true, data: options.slice(0, MAX_OPTIONS) };
}
