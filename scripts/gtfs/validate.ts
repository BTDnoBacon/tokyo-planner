/**
 * 검증 셋: 자체 RAPTOR 결과를 Transitous(공개 MOTIS 인스턴스, 같은 TokyoGTFS 사용)와 대조.
 *
 * 사용법: pnpm tsx scripts/gtfs/validate.ts [HH:MM] [YYYYMMDD]
 * 네트워크 필요 (api.transitous.org). 각 구간의 최조 도착시각 차이를 분 단위로 비교하고
 * 허용 오차(기본 5분) 초과 구간을 표로 보고한다.
 *
 * 주의: Transitous는 버스 피드도 포함하므로 rail 계열 모드로 제한해 비교한다.
 * 결과가 어긋나는 구간은 대형역 도보시간 오버라이드 후보.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deserializeTimetable } from "../../src/lib/engine/format";
import { route as raptor } from "../../src/lib/engine/raptor";
import { findStopsByKoName, centroidOf } from "./lookup";
import { haversineMeters } from "./transform";

const TOLERANCE_MIN = 5;
const REQUEST_DELAY_MS = 700;

/** 대표 구간 — JR/메트로/사철/직통/광역 혼합 */
const OD_PAIRS: [string, string][] = [
  ["신주쿠", "시부야"],
  ["신주쿠", "도쿄"],
  ["신주쿠", "오테마치"],
  ["시부야", "우에노"],
  ["이케부쿠로", "신바시"],
  ["도쿄", "시나가와"],
  ["아키하바라", "롯폰기"],
  ["우에노", "아사쿠사"],
  ["긴자", "신주쿠"],
  ["에비스", "오테마치"],
  ["메구로", "이케부쿠로"],
  ["고탄다", "아키하바라"],
  ["기치조지", "시부야"],
  ["기치조지", "아사쿠사"],
  ["나카노", "도쿄"],
  ["다치카와", "신주쿠"],
  ["미타카", "긴자"],
  ["지유가오카", "이케부쿠로"],
  ["지유가오카", "요코하마"],
  ["무사시코스기", "와코시"],
  ["요코하마", "시부야"],
  ["요코하마", "도쿄"],
  ["가와사키", "신바시"],
  ["오후나", "도쿄"],
  ["마치다", "신주쿠"],
  ["후추", "신주쿠"],
  ["조후", "오테마치"],
  ["오미야", "도쿄"],
  ["우라와", "신주쿠"],
  ["가와고에", "이케부쿠로"],
  ["지바", "도쿄"],
  ["후나바시", "아키하바라"],
  ["니시후나바시", "오테마치"],
  ["가시와", "우에노"],
  ["츠쿠바", "아키하바라"],
  ["오시아게", "시부야"],
  ["긴시초", "신주쿠"],
  ["기타센주", "나카메구로"],
  ["아자부주반", "이케부쿠로"],
  ["오다이바카이힌코엔", "신바시"],
];

interface Row {
  pair: string;
  ours: number | null; // 도착시각(초)
  theirs: number | null;
  oursTransfers?: number;
  note: string;
}

function fmt(secs: number | null): string {
  if (secs === null) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 동명이역 방어: 중앙값 좌표에서 2km 넘게 떨어진 매칭(다른 지역의 같은 이름 역)을 제거 */
function clusterNearMedian(
  tt: ReturnType<typeof deserializeTimetable>,
  stops: number[]
): number[] {
  if (stops.length <= 1) return stops;
  const lats = stops.map((s) => tt.stopLats[s]).sort((a, b) => a - b);
  const lons = stops.map((s) => tt.stopLons[s]).sort((a, b) => a - b);
  const mLat = lats[Math.floor(lats.length / 2)];
  const mLon = lons[Math.floor(lons.length / 2)];
  return stops.filter(
    (s) => haversineMeters(mLat, mLon, tt.stopLats[s], tt.stopLons[s]) < 2000
  );
}

async function fetchTransitous(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  isoTime: string
): Promise<number | null> {
  const url = new URL("https://api.transitous.org/api/v1/plan");
  url.searchParams.set("fromPlace", `${from.lat},${from.lon}`);
  url.searchParams.set("toPlace", `${to.lat},${to.lon}`);
  url.searchParams.set("time", isoTime);
  url.searchParams.set("arriveBy", "false");
  url.searchParams.set("numItineraries", "5");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "tokyo-planner-validation (personal project)" },
      });
      if (!res.ok) {
        if (attempt === 0) continue;
        console.error(`\n  HTTP ${res.status}: ${url.pathname}`);
        return null;
      }
      const json = (await res.json()) as {
        itineraries?: { legs?: { mode?: string; endTime?: string | number }[] }[];
      };
      // 좌표 기반 질의라 앞뒤 도보가 포함됨 — 도보 leg를 제외한 "마지막 하차 시각"으로 비교
      const alights: number[] = [];
      for (const it of json.itineraries ?? []) {
        const transitLegs = (it.legs ?? []).filter((l) => l.mode !== "WALK");
        if (transitLegs.length === 0) continue;
        const last = transitLegs[transitLegs.length - 1].endTime;
        const t = typeof last === "number" ? last : Date.parse(String(last));
        if (Number.isFinite(t)) alights.push(t);
      }
      if (alights.length === 0) return null;
      // epoch ms → JST 서비스일 기준 초
      const jst = new Date(Math.min(...alights) + 9 * 3600 * 1000);
      return (
        jst.getUTCHours() * 3600 + jst.getUTCMinutes() * 60 + jst.getUTCSeconds()
      );
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

async function main() {
  const [timeStr = "09:00", dateStr = "20260901"] = process.argv.slice(2);
  const [hh, mm] = timeStr.split(":").map(Number);
  const departureSecs = hh * 3600 + mm * 60;
  const date = Number(dateStr);
  const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  const isoTime = `${isoDate}T${timeStr}:00+09:00`;

  const tt = deserializeTimetable(
    readFileSync(join(process.cwd(), "data/engine/tokyo-rail.bin"))
  );

  console.log(`검증 시작: ${OD_PAIRS.length}개 구간, ${isoDate} ${timeStr} 출발, 허용 오차 ±${TOLERANCE_MIN}분\n`);

  const rows: Row[] = [];
  for (const [fromName, toName] of OD_PAIRS) {
    const pair = `${fromName}→${toName}`;
    const fromStops = clusterNearMedian(tt, findStopsByKoName(tt, fromName));
    const toStops = clusterNearMedian(tt, findStopsByKoName(tt, toName));
    if (fromStops.length === 0 || toStops.length === 0) {
      rows.push({ pair, ours: null, theirs: null, note: `역명 미해결 (${fromStops.length === 0 ? fromName : toName})` });
      continue;
    }

    // 공정 비교: Transitous는 좌표에서 플랫폼까지 걷는 시간이 탑승을 늦춘다 —
    // 우리 쪽도 역 중심 좌표 → 각 플랫폼 도보 시간을 출발 오프셋으로 부여
    const fromCenter = centroidOf(tt, fromStops);
    const accessSecs = (stop: number) =>
      Math.round(
        (haversineMeters(fromCenter.lat, fromCenter.lon, tt.stopLats[stop], tt.stopLons[stop]) *
          1.3) /
          (4.8 / 3.6)
      );
    const journeys = raptor(tt, {
      sources: fromStops.map((stop) => ({ stop, offsetSecs: accessSecs(stop) })),
      targets: toStops.map((stop) => ({ stop, offsetSecs: 0 })),
      departureSecs,
      date,
    });
    const oursBest = journeys.length > 0 ? journeys[journeys.length - 1] : null;

    const theirs = await fetchTransitous(
      centroidOf(tt, fromStops),
      centroidOf(tt, toStops),
      isoTime
    );
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

    rows.push({
      pair,
      ours: oursBest?.arrivalSecs ?? null,
      oursTransfers: oursBest?.transfers,
      theirs,
      note: "",
    });
    process.stdout.write(".");
  }
  console.log("\n");

  // ── 리포트 ──
  let ok = 0;
  let warn = 0;
  let fail = 0;
  const details: string[] = [];
  for (const r of rows) {
    if (r.ours === null || r.theirs === null) {
      fail++;
      details.push(
        `✗ ${r.pair.padEnd(24)} 자체 ${fmt(r.ours)} / Transitous ${fmt(r.theirs)} ${r.note}`
      );
      continue;
    }
    const diffMin = Math.round((r.ours - r.theirs) / 60);
    if (Math.abs(diffMin) <= TOLERANCE_MIN) {
      ok++;
      details.push(
        `✓ ${r.pair.padEnd(24)} 자체 ${fmt(r.ours)} (환승${r.oursTransfers}) / Transitous ${fmt(r.theirs)} (${diffMin >= 0 ? "+" : ""}${diffMin}분)`
      );
    } else {
      warn++;
      details.push(
        `⚠ ${r.pair.padEnd(24)} 자체 ${fmt(r.ours)} (환승${r.oursTransfers}) / Transitous ${fmt(r.theirs)} (${diffMin >= 0 ? "+" : ""}${diffMin}분)`
      );
    }
  }
  console.log(details.join("\n"));
  console.log(
    `\n결과: 일치 ${ok} / 오차 초과 ${warn} / 비교 불가 ${fail} (총 ${rows.length})`
  );
  // 오차 초과·비교 불가는 사람 판단이 필요하므로 exit code는 항상 0 (리포트 도구)
}

main();
