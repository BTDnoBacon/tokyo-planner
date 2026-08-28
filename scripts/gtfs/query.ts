/**
 * 실데이터 경로탐색 스모크 테스트 CLI.
 *
 * 사용법: pnpm tsx scripts/gtfs/query.ts <출발역> <도착역> [HH:MM] [YYYYMMDD]
 * 예:     pnpm tsx scripts/gtfs/query.ts 신주쿠 시부야 09:00
 * 역명은 한국어 번역(stopNamesKo) 부분 일치 — 매칭되는 모든 플랫폼을 출발/도착 후보로 사용.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deserializeTimetable } from "../../src/lib/engine/format";
import { route as raptor } from "../../src/lib/engine/raptor";
import { findStopsByKoName } from "./lookup";

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const [fromName, toName, timeStr = "09:00", dateStr = "20260901"] = process.argv.slice(2);
if (!fromName || !toName) {
  console.error("사용법: tsx scripts/gtfs/query.ts <출발역> <도착역> [HH:MM] [YYYYMMDD]");
  process.exit(1);
}

const loadStart = performance.now();
const tt = deserializeTimetable(readFileSync(join(process.cwd(), "data/engine/tokyo-rail.bin")));
const loadMs = Math.round(performance.now() - loadStart);

const sources = findStopsByKoName(tt, fromName).map((stop) => ({ stop, offsetSecs: 0 }));
const targets = findStopsByKoName(tt, toName).map((stop) => ({ stop, offsetSecs: 0 }));
if (sources.length === 0 || targets.length === 0) {
  console.error(`역을 찾을 수 없음: ${sources.length === 0 ? fromName : toName}`);
  process.exit(1);
}
console.log(
  `${fromName}(플랫폼 ${sources.length}) → ${toName}(플랫폼 ${targets.length}), ${dateStr} ${timeStr} 출발 | 로드 ${loadMs}ms`
);

const [hh, mm] = timeStr.split(":").map(Number);
const queryStart = performance.now();
const journeys = raptor(tt, {
  sources,
  targets,
  departureSecs: hh * 3600 + mm * 60,
  date: Number(dateStr),
});
const queryMs = (performance.now() - queryStart).toFixed(1);

if (journeys.length === 0) {
  console.log("경로 없음");
} else {
  for (const j of journeys) {
    const mins = Math.round((j.arrivalSecs - j.departureSecs) / 60);
    console.log(`\n■ ${fmt(j.departureSecs)} → ${fmt(j.arrivalSecs)} (${mins}분, 환승 ${j.transfers}회)`);
    for (const leg of j.legs) {
      const from = tt.stopNamesKo[leg.fromStop] || tt.stopNames[leg.fromStop];
      const to = tt.stopNamesKo[leg.toStop] || tt.stopNames[leg.toStop];
      if (leg.kind === "walk") {
        console.log(`   도보 ${fmt(leg.departureSecs)} ${from} → ${fmt(leg.arrivalSecs)} ${to}`);
      } else {
        const meta = tt.routes[tt.routeMetaIndex[leg.route!]];
        const cont = leg.inSeatContinuation ? " (직통)" : "";
        console.log(
          `   ${meta.longName}${cont} ${fmt(leg.departureSecs)} ${from} → ${fmt(leg.arrivalSecs)} ${to}`
        );
      }
    }
  }
}
console.log(`\n쿼리 ${queryMs}ms`);
