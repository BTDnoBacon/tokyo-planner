/**
 * 자체 경로탐색 엔진의 서버 사이드 진입점.
 * 시간표 바이너리를 프로세스당 1회 로드해 캐시하고, 공통 로직(plan.ts)에 위임한다.
 * (Node 전용 — 클라이언트 컴포넌트에서 import 금지. 브라우저는 engine/worker.ts 사용)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timetable } from "./engine/types";
import { deserializeTimetable } from "./engine/format";
import {
  planTransit,
  planTransitOptions,
  type TransitRouteResponse,
  type TransitOptionsResponse,
} from "./engine/plan";

const BIN_PATH = join(process.cwd(), "data", "engine", "tokyo-rail.bin");

let cached: Timetable | null = null;

export function loadTimetable(): Timetable {
  if (cached === null) {
    cached = deserializeTimetable(readFileSync(BIN_PATH));
  }
  return cached;
}

export type { TransitRouteResponse, TransitOptionsResponse };

export function computeTransitOptions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number,
  travelDate?: string
): TransitOptionsResponse {
  let tt: Timetable;
  try {
    tt = loadTimetable();
  } catch {
    return { ok: false, error: "시간표 데이터가 없습니다 (pnpm data:build 필요)." };
  }
  return planTransitOptions(tt, originLat, originLng, destLat, destLng, departureHour, travelDate);
}

export function computeTransitRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number,
  travelDate?: string
): TransitRouteResponse {
  let tt: Timetable;
  try {
    tt = loadTimetable();
  } catch {
    return { ok: false, error: "시간표 데이터가 없습니다 (pnpm data:build 필요)." };
  }
  return planTransit(tt, originLat, originLng, destLat, destLng, departureHour, travelDate);
}
