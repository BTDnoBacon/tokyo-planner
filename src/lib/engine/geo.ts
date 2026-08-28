/**
 * 좌표 ↔ 정류장 매핑과 Journey → 앱 표시 형태 변환.
 * 브라우저 안전 (Node API 없음) — 서버 액션과 테스트 양쪽에서 사용.
 */
import type { Timetable } from "./types";
import type { TransitStep } from "../types";
import type { Journey } from "./raptor";

const WALK_SPEED_MPS = 4.8 / 3.6;
const DETOUR_FACTOR = 1.3;
/** 이 반경 안의 플랫폼들을 출발/도착 후보로 사용 */
const NEAR_RADIUS_M = 1000;
/** 반경 내에 없으면 이 거리까지 최근접 역 하나를 허용 */
const MAX_RADIUS_M = 3000;
/** RAPTOR 소스 폭 제한 */
const MAX_CANDIDATES = 12;

export function walkSecsForMeters(meters: number): number {
  return Math.round((meters * DETOUR_FACTOR) / WALK_SPEED_MPS);
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 좌표 주변 플랫폼 후보 — [정류장 인덱스, 도보 초] */
export function nearbyPlatforms(
  tt: Timetable,
  lat: number,
  lon: number
): { stop: number; walkSecs: number }[] {
  const candidates: { stop: number; meters: number }[] = [];
  let nearest: { stop: number; meters: number } | null = null;
  for (let i = 0; i < tt.stopIds.length; i++) {
    if (tt.stopIsStation[i]) continue;
    // 위도 선별로 haversine 호출 축소
    if (Math.abs(tt.stopLats[i] - lat) * 111000 > MAX_RADIUS_M) continue;
    const meters = distanceMeters(lat, lon, tt.stopLats[i], tt.stopLons[i]);
    if (meters <= NEAR_RADIUS_M) candidates.push({ stop: i, meters });
    if (meters <= MAX_RADIUS_M && (nearest === null || meters < nearest.meters)) {
      nearest = { stop: i, meters };
    }
  }
  const picked =
    candidates.length > 0
      ? candidates.sort((a, b) => a.meters - b.meters).slice(0, MAX_CANDIDATES)
      : nearest !== null
        ? [nearest]
        : [];
  return picked.map(({ stop, meters }) => ({ stop, walkSecs: walkSecsForMeters(meters) }));
}

export interface TransitPath {
  color: string;
  points: { lat: number; lng: number }[];
}

export interface TransitResult {
  steps: TransitStep[];
  paths: TransitPath[];
  /** 출발지 도보 시작 ~ 도착지 도보 종료 (초, 서비스일 기준) */
  startSecs: number;
  endSecs: number;
  durationMinutes: number;
}

/** RAPTOR Journey → 앱 표시용 TransitStep/폴리라인 변환 */
export function journeyToResult(
  tt: Timetable,
  journey: Journey,
  accessWalkSecs: number,
  egressWalkSecs: number
): TransitResult {
  const steps: TransitStep[] = [];
  const paths: TransitPath[] = [];

  if (accessWalkSecs > 60) {
    steps.push({ type: "walk", lineName: "도보", minutes: Math.round(accessWalkSecs / 60) });
  }

  for (const leg of journey.legs) {
    if (leg.kind === "walk") {
      steps.push({
        type: "walk",
        lineName: "도보",
        minutes: Math.max(1, Math.round((leg.arrivalSecs - leg.departureSecs) / 60)),
      });
      continue;
    }
    const meta = tt.routes[tt.routeMetaIndex[leg.route!]];
    steps.push({
      type: "train",
      lineName: meta.longName + (leg.inSeatContinuation ? " (직통)" : ""),
      fromStation: tt.stopNamesKo[leg.fromStop] || tt.stopNames[leg.fromStop],
      toStation: tt.stopNamesKo[leg.toStop] || tt.stopNames[leg.toStop],
      minutes: Math.max(1, Math.round((leg.arrivalSecs - leg.departureSecs) / 60)),
      color: meta.color ? `#${meta.color}` : undefined,
    });

    // 정차역 좌표를 이은 폴리라인 (shapes 대신 — 역간 직선 근사)
    const r = leg.route!;
    const base = tt.routeStopsIndex[r];
    const len = tt.routeStopsIndex[r + 1] - base;
    let from = -1;
    let to = -1;
    for (let p = 0; p < len; p++) {
      const s = tt.routeStops[base + p];
      if (s === leg.fromStop && from < 0) from = p;
      if (s === leg.toStop) to = p;
    }
    if (from >= 0 && to > from) {
      const points = [];
      for (let p = from; p <= to; p++) {
        const s = tt.routeStops[base + p];
        points.push({ lat: tt.stopLats[s], lng: tt.stopLons[s] });
      }
      paths.push({ color: meta.color ? `#${meta.color}` : "#f97316", points });
    }
  }

  if (egressWalkSecs > 60) {
    steps.push({ type: "walk", lineName: "도보", minutes: Math.round(egressWalkSecs / 60) });
  }

  // Journey.arrivalSecs는 raptor가 target offset(이탈 도보)을 이미 더한 값 —
  // 여기서 egressWalkSecs를 또 더하면 이중 계산이므로 표시(step)에만 사용한다.
  // 이동 시간 = 접근 도보 + (첫 승차 → 이탈 도보 완료). 첫차 대기시간은 제외.
  const startSecs = journey.departureSecs - accessWalkSecs;
  const endSecs = journey.arrivalSecs;
  const durationMinutes = Math.max(
    1,
    Math.ceil((accessWalkSecs + (journey.arrivalSecs - journey.departureSecs)) / 60)
  );
  return { steps, paths, startSecs, endSecs, durationMinutes };
}
