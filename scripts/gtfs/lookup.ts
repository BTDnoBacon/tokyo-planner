import type { Timetable } from "../../src/lib/engine/types";

/** 한국어 역명으로 플랫폼 정류장 검색 — 정확 일치 우선, 없으면 부분 일치 */
export function findStopsByKoName(tt: Timetable, name: string): number[] {
  const partial: number[] = [];
  const exact: number[] = [];
  for (let i = 0; i < tt.stopIds.length; i++) {
    if (tt.stopIsStation[i]) continue;
    if (tt.stopNamesKo[i] === name) exact.push(i);
    else if (tt.stopNamesKo[i].includes(name)) partial.push(i);
  }
  return exact.length > 0 ? exact : partial;
}

/** 매칭된 플랫폼들의 평균 좌표 (외부 API 질의용) */
export function centroidOf(tt: Timetable, stops: number[]): { lat: number; lon: number } {
  let lat = 0;
  let lon = 0;
  for (const s of stops) {
    lat += tt.stopLats[s];
    lon += tt.stopLons[s];
  }
  return { lat: lat / stops.length, lon: lon / stops.length };
}
