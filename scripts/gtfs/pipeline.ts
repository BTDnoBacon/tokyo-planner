/**
 * TokyoGTFS → RAPTOR용 바이너리 시간표 빌드 파이프라인.
 *
 * 직접 실행: pnpm data:build (= tsx scripts/gtfs/build.ts)
 * 입력: data/gtfs/extracted/, 출력: data/engine/tokyo-rail.bin
 * 데이터 다운로드까지 포함한 자동 준비는 prepare.ts 참고 (배포 빌드에서 사용).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseCsvRecords } from "./csv";
import { buildTimetable, type GtfsInput, type GtfsStop, type GtfsTrip } from "./transform";
import { serializeTimetable, deserializeTimetable } from "../../src/lib/engine/format";
import { parseGtfsTime, activeServices } from "../../src/lib/engine/calendar";
import type { RouteMeta, ServiceCalendar } from "../../src/lib/engine/types";

const GTFS_DIR = join(process.cwd(), "data/gtfs/extracted");
const OUT_DIR = join(process.cwd(), "data/engine");
const OUT_FILE = join(OUT_DIR, "tokyo-rail.bin");

function read(name: string): string {
  return readFileSync(join(GTFS_DIR, name), "utf8");
}

function step(label: string): (detail?: string) => void {
  const start = performance.now();
  return (detail = "") => {
    const ms = Math.round(performance.now() - start);
    console.log(`  ${label}: ${ms}ms ${detail}`);
  };
}

export function runPipeline() {
  const total = performance.now();
  console.log("GTFS → Timetable 빌드 시작");

  // ── translations (역명 ko/en) ──
  let done = step("translations.txt");
  const nameKo = new Map<string, string>();
  const nameEn = new Map<string, string>();
  for (const rec of parseCsvRecords(read("translations.txt"))) {
    if (rec.get("table_name") !== "stops" || rec.get("field_name") !== "stop_name") continue;
    const lang = rec.get("language");
    if (lang === "ko") nameKo.set(rec.get("record_id"), rec.get("translation"));
    else if (lang === "en") nameEn.set(rec.get("record_id"), rec.get("translation"));
  }
  done(`ko ${nameKo.size} / en ${nameEn.size}`);

  // ── stops ──
  done = step("stops.txt");
  const stops: GtfsStop[] = [];
  for (const rec of parseCsvRecords(read("stops.txt"))) {
    const id = rec.get("stop_id");
    stops.push({
      id,
      name: rec.get("stop_name"),
      nameKo: nameKo.get(id) ?? "",
      nameEn: nameEn.get(id) ?? "",
      lat: Number(rec.get("stop_lat")),
      lon: Number(rec.get("stop_lon")),
      isStation: rec.get("location_type") === "1",
      parentId: rec.get("parent_station"),
    });
  }
  const stopIdx = new Map(stops.map((s, i) => [s.id, i]));
  done(`${stops.length} stops`);

  // ── routes ──
  done = step("routes.txt");
  const routes: RouteMeta[] = [];
  for (const rec of parseCsvRecords(read("routes.txt"))) {
    routes.push({
      id: rec.get("route_id"),
      agencyId: rec.get("agency_id"),
      shortName: rec.get("route_short_name"),
      longName: rec.get("route_long_name"),
      type: Number(rec.get("route_type")),
      color: rec.get("route_color"),
      textColor: rec.get("route_text_color"),
    });
  }
  done(`${routes.length} routes`);

  // ── calendar / calendar_dates ──
  done = step("calendar");
  const services: ServiceCalendar[] = [];
  const svcByIdx = new Map<string, ServiceCalendar>();
  for (const rec of parseCsvRecords(read("calendar.txt"))) {
    const svc: ServiceCalendar = {
      id: rec.get("service_id"),
      weekdays:
        (Number(rec.get("monday")) << 0) |
        (Number(rec.get("tuesday")) << 1) |
        (Number(rec.get("wednesday")) << 2) |
        (Number(rec.get("thursday")) << 3) |
        (Number(rec.get("friday")) << 4) |
        (Number(rec.get("saturday")) << 5) |
        (Number(rec.get("sunday")) << 6),
      startDate: Number(rec.get("start_date")),
      endDate: Number(rec.get("end_date")),
      addedDates: [],
      removedDates: [],
    };
    services.push(svc);
    svcByIdx.set(svc.id, svc);
  }
  for (const rec of parseCsvRecords(read("calendar_dates.txt"))) {
    let svc = svcByIdx.get(rec.get("service_id"));
    if (!svc) {
      // calendar.txt에 없는 service — exception만으로 정의되는 경우
      svc = {
        id: rec.get("service_id"),
        weekdays: 0,
        startDate: 0,
        endDate: 0,
        addedDates: [],
        removedDates: [],
      };
      services.push(svc);
      svcByIdx.set(svc.id, svc);
    }
    const date = Number(rec.get("date"));
    if (rec.get("exception_type") === "1") svc.addedDates.push(date);
    else svc.removedDates.push(date);
  }
  done(`${services.length} services`);

  // ── trips ──
  done = step("trips.txt");
  const trips: GtfsTrip[] = [];
  const tripByIdx = new Map<string, GtfsTrip>();
  for (const rec of parseCsvRecords(read("trips.txt"))) {
    const trip: GtfsTrip = {
      id: rec.get("trip_id"),
      routeId: rec.get("route_id"),
      serviceId: rec.get("service_id"),
      headsign: rec.get("trip_headsign"),
      stopTimes: [],
    };
    trips.push(trip);
    tripByIdx.set(trip.id, trip);
  }
  done(`${trips.length} trips`);

  // ── stop_times (최대 파일 — 121만 행) ──
  done = step("stop_times.txt");
  let stRows = 0;
  let badRefs = 0;
  let nonMonotonic = 0;
  for (const rec of parseCsvRecords(read("stop_times.txt"))) {
    const trip = tripByIdx.get(rec.get("trip_id"));
    const stop = stopIdx.get(rec.get("stop_id"));
    if (!trip || stop === undefined) {
      badRefs++;
      continue;
    }
    const arr = parseGtfsTime(rec.get("arrival_time"));
    const dep = parseGtfsTime(rec.get("departure_time"));
    if (dep < arr) nonMonotonic++;
    trip.stopTimes.push(Number(rec.get("stop_sequence")), stop, arr, dep);
    stRows++;
  }
  done(`${stRows} rows (참조 오류 ${badRefs}, dep<arr ${nonMonotonic})`);
  if (badRefs > 0) throw new Error(`stop_times에 미해결 참조 ${badRefs}건 — 데이터 확인 필요`);

  // ── transfers (직통운전 쌍) ──
  done = step("transfers.txt");
  const continuations: [string, string][] = [];
  for (const rec of parseCsvRecords(read("transfers.txt"))) {
    if (rec.get("transfer_type") === "4") {
      continuations.push([rec.get("from_trip_id"), rec.get("to_trip_id")]);
    }
  }
  done(`${continuations.length} in-seat transfer pairs`);

  // ── 변환 ──
  done = step("transform");
  const input: GtfsInput = { stops, routes, trips, continuations, services };
  const timetable = buildTimetable(input);
  const nRaptorRoutes = timetable.routeStopsIndex.length - 1;
  const nTransfers = timetable.transfersTo.length;
  const nContinuations = timetable.tripContinuation.filter((v) => v >= 0).length;
  done(
    `raptor routes ${nRaptorRoutes} / trips ${timetable.tripIds.length} / footpaths ${nTransfers} / 직통 ${nContinuations}`
  );

  // ── 직렬화 + 라운드트립 검증 ──
  done = step("serialize");
  const bin = serializeTimetable(timetable);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, bin);
  done(`${(bin.length / 1024 / 1024).toFixed(1)}MB → ${OUT_FILE}`);

  done = step("deserialize (검증)");
  const loaded = deserializeTimetable(readFileSync(OUT_FILE));
  if (
    loaded.stopIds.length !== timetable.stopIds.length ||
    loaded.stopTimes.length !== timetable.stopTimes.length ||
    loaded.stopTimes[100] !== timetable.stopTimes[100]
  ) {
    throw new Error("라운드트립 검증 실패");
  }
  done("roundtrip OK");

  // ── 새니티 체크: 신주쿠 검색 + 오늘 운행 서비스 ──
  console.log("\n새니티 체크:");
  const shinjuku = loaded.stopIds
    .map((_, i) => i)
    .filter((i) => loaded.stopNamesKo[i].includes("신주쿠") && !loaded.stopIsStation[i]);
  console.log(`  '신주쿠' 포함 정류장(플랫폼): ${shinjuku.length}개`);
  const sample = shinjuku[0];
  if (sample !== undefined) {
    const nRoutes2 =
      loaded.stopRoutesIndex[sample + 1] - loaded.stopRoutesIndex[sample];
    const nFoot = loaded.transfersIndex[sample + 1] - loaded.transfersIndex[sample];
    console.log(
      `  예: ${loaded.stopNamesKo[sample]} (${loaded.stopIds[sample]}) — raptor route ${nRoutes2}개, 도보환승 ${nFoot}개`
    );
  }
  const today = 20260901; // 화요일 (평일 검증용 고정 날짜)
  const active = activeServices(loaded.services, today);
  console.log(
    `  ${today} 운행 서비스: ${[...active].map((i) => loaded.services[i].id).join(", ")}`
  );

  console.log(`\n완료: ${Math.round(performance.now() - total)}ms`);
}
