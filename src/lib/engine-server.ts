/**
 * 자체 경로탐색 엔진의 서버 사이드 진입점.
 * 시간표 바이너리를 프로세스당 1회 로드해 캐시하고, 좌표 기반 transit 질의를 처리한다.
 * (Node 전용 — 클라이언트 컴포넌트에서 import 금지)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timetable } from "./engine/types";
import { deserializeTimetable } from "./engine/format";
import { route as raptor } from "./engine/raptor";
import { nearbyPlatforms, journeyToResult, type TransitResult } from "./engine/geo";

const BIN_PATH = join(process.cwd(), "data", "engine", "tokyo-rail.bin");
/** Pareto 후보 중 선택 가중치 — 환승 1회당 이 분만큼 도착이 늦은 것으로 간주 */
const TRANSFER_PENALTY_MIN = 3;

let cached: Timetable | null = null;

export function loadTimetable(): Timetable {
  if (cached === null) {
    cached = deserializeTimetable(readFileSync(BIN_PATH));
  }
  return cached;
}

/** JST 기준 오늘 날짜(YYYYMMDD)와 현재 초 */
function nowJst(): { date: number; secs: number } {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return {
    date: jst.getUTCFullYear() * 10000 + (jst.getUTCMonth() + 1) * 100 + jst.getUTCDate(),
    secs: jst.getUTCHours() * 3600 + jst.getUTCMinutes() * 60,
  };
}

function nextDay(date: number): number {
  const y = Math.floor(date / 10000);
  const m = Math.floor((date % 10000) / 100);
  const d = date % 100;
  const next = new Date(Date.UTC(y, m - 1, d) + 24 * 3600 * 1000);
  return next.getUTCFullYear() * 10000 + (next.getUTCMonth() + 1) * 100 + next.getUTCDate();
}

export type TransitRouteResponse =
  | { ok: true; data: TransitResult }
  | { ok: false; error: string };

export function computeTransitRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number
): TransitRouteResponse {
  let tt: Timetable;
  try {
    tt = loadTimetable();
  } catch {
    return { ok: false, error: "시간표 데이터가 없습니다 (pnpm data:build 필요)." };
  }

  const sources = nearbyPlatforms(tt, originLat, originLng);
  const targets = nearbyPlatforms(tt, destLat, destLng);
  if (sources.length === 0) return { ok: false, error: "출발지 주변 3km 내에 역이 없습니다." };
  if (targets.length === 0) return { ok: false, error: "도착지 주변 3km 내에 역이 없습니다." };

  // 기존 NAVITIME 동작과 동일: 오늘 해당 시가 지났으면 다음 날로
  const now = nowJst();
  const date = departureHour * 3600 <= now.secs ? nextDay(now.date) : now.date;

  const journeys = raptor(tt, {
    sources: sources.map(({ stop, walkSecs }) => ({ stop, offsetSecs: walkSecs })),
    targets: targets.map(({ stop, walkSecs }) => ({ stop, offsetSecs: walkSecs })),
    departureSecs: departureHour * 3600,
    date,
  });
  if (journeys.length === 0) return { ok: false, error: "경로를 찾을 수 없습니다." };

  // Pareto 후보 중 "도착시각 + 환승 페널티" 최소를 선택
  const sourceOffset = new Map(sources.map((s) => [s.stop, s.walkSecs]));
  const targetOffset = new Map(targets.map((s) => [s.stop, s.walkSecs]));
  let best = journeys[0];
  let bestScore = Infinity;
  for (const j of journeys) {
    const egress = j.legs.length > 0 ? (targetOffset.get(j.legs[j.legs.length - 1].toStop) ?? 0) : 0;
    const score = j.arrivalSecs + egress + j.transfers * TRANSFER_PENALTY_MIN * 60;
    if (score < bestScore) {
      bestScore = score;
      best = j;
    }
  }
  if (best.legs.length === 0) {
    return { ok: false, error: "출발지와 도착지가 같은 역입니다." };
  }

  const access = sourceOffset.get(best.legs[0].fromStop) ?? 0;
  const egress = targetOffset.get(best.legs[best.legs.length - 1].toStop) ?? 0;
  return { ok: true, data: journeyToResult(tt, best, access, egress) };
}
