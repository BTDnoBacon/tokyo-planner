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
  /** "walk"는 점선으로 표시 — 생략 시 실선(전철) */
  kind?: "rail" | "walk";
}

/** 도보 점선 색 (지도 위 시인성 좋은 중립 회색) */
const WALK_PATH_COLOR = "#64748b";
/** 이 거리 미만의 도보는 선을 그리지 않음 (지도 노이즈 방지) */
const MIN_WALK_PATH_M = 30;

function walkPath(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): TransitPath | null {
  if (distanceMeters(fromLat, fromLng, toLat, toLng) < MIN_WALK_PATH_M) return null;
  return {
    kind: "walk",
    color: WALK_PATH_COLOR,
    points: [
      { lat: fromLat, lng: fromLng },
      { lat: toLat, lng: toLng },
    ],
  };
}

export interface TransitResult {
  steps: TransitStep[];
  paths: TransitPath[];
  /** 출발지 도보 시작 ~ 도착지 도보 종료 (초, 서비스일 기준) */
  startSecs: number;
  endSecs: number;
  durationMinutes: number;
  /** 환승 횟수 (직통은 미카운트) — 대안 경로 비교 표시용 */
  transfers: number;
}

/** 출발지·도착지 좌표 — 도보 구간 점선 표시용 (없으면 도보 선 생략) */
export interface JourneyEndpoints {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

/** RAPTOR Journey → 앱 표시용 TransitStep/폴리라인 변환 */
export function journeyToResult(
  tt: Timetable,
  journey: Journey,
  accessWalkSecs: number,
  egressWalkSecs: number,
  endpoints?: JourneyEndpoints
): TransitResult {
  const steps: TransitStep[] = [];
  const paths: TransitPath[] = [];

  if (accessWalkSecs > 60) {
    steps.push({ type: "walk", lineName: "도보", minutes: Math.round(accessWalkSecs / 60) });
  }
  // 접근 도보 점선: 출발지 → 첫 승차 정류장
  if (endpoints && journey.legs.length > 0) {
    const first = journey.legs[0].fromStop;
    const p = walkPath(
      endpoints.originLat, endpoints.originLng, tt.stopLats[first], tt.stopLons[first]
    );
    if (p) paths.push(p);
  }

  for (const leg of journey.legs) {
    if (leg.kind === "walk") {
      steps.push({
        type: "walk",
        lineName: "도보",
        minutes: Math.max(1, Math.round((leg.arrivalSecs - leg.departureSecs) / 60)),
      });
      // 환승 도보 점선: 정류장 → 정류장
      const p = walkPath(
        tt.stopLats[leg.fromStop], tt.stopLons[leg.fromStop],
        tt.stopLats[leg.toStop], tt.stopLons[leg.toStop]
      );
      if (p) paths.push(p);
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

    // 승차~하차 구간 폴리라인 — 선형(shapes)이 있으면 실선형, 없으면 정차역 좌표 직선 폴백
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
      const color = meta.color ? `#${meta.color}` : "#f97316";
      const shapeFrom = tt.routeStopShapePos[base + from];
      const shapeTo = tt.routeStopShapePos[base + to];
      const points = [];
      if (shapeFrom >= 0 && shapeTo > shapeFrom) {
        for (let i = shapeFrom; i <= shapeTo; i++) {
          points.push({ lat: tt.shapeLats[i], lng: tt.shapeLons[i] });
        }
      } else {
        for (let p = from; p <= to; p++) {
          const s = tt.routeStops[base + p];
          points.push({ lat: tt.stopLats[s], lng: tt.stopLons[s] });
        }
      }
      paths.push({ kind: "rail", color, points });
    }
  }

  if (egressWalkSecs > 60) {
    steps.push({ type: "walk", lineName: "도보", minutes: Math.round(egressWalkSecs / 60) });
  }
  // 이탈 도보 점선: 마지막 하차 정류장 → 도착지
  if (endpoints && journey.legs.length > 0) {
    const last = journey.legs[journey.legs.length - 1].toStop;
    const p = walkPath(
      tt.stopLats[last], tt.stopLons[last], endpoints.destLat, endpoints.destLng
    );
    if (p) paths.push(p);
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
  return { steps, paths, startSecs, endSecs, durationMinutes, transfers: journey.transfers };
}
