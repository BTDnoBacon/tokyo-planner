import { describe, it, expect } from "vitest";
import { buildTimetable, type GtfsInput } from "../../../scripts/gtfs/transform";
import { route as raptor } from "./raptor";
import { nearbyPlatforms, journeyToResult } from "./geo";
import type { ServiceCalendar, RouteMeta } from "./types";

const WEEKDAY: ServiceCalendar = {
  id: "Weekday", weekdays: 0b0011111, startDate: 20260824, endDate: 20270824,
  addedDates: [], removedDates: [],
};
const meta = (id: string): RouteMeta => ({
  id, agencyId: "Ag", shortName: id, longName: `${id}선`, type: 2, color: "FF0000", textColor: "FFFFFF",
});
const stop = (id: string, lat: number, lon = 139.0) => ({
  id, name: id, nameKo: `${id}역`, nameEn: id, lat, lon, isStation: false, parentId: "",
});
const h = (hh: number, mm = 0) => hh * 3600 + mm * 60;

// A(35.0) — B(35.1) — C(35.2), 위도 0.1도 ≈ 11km 간격
const input: GtfsInput = {
  stops: [stop("A", 35.0), stop("B", 35.1), stop("C", 35.2)],
  routes: [meta("R1")],
  trips: [
    {
      id: "t1", routeId: "R1", serviceId: "Weekday", headsign: "C행",
      stopTimes: [0, 0, h(9), h(9), 1, 1, h(9, 10), h(9, 11), 2, 2, h(9, 20), h(9, 20)],
    },
  ],
  continuations: [],
  services: [WEEKDAY],
};
const tt = buildTimetable(input);

describe("nearbyPlatforms", () => {
  it("반경 1km 내 플랫폼을 도보 시간과 함께 반환", () => {
    // A역(35.0, 139.0)에서 300m쯤 떨어진 지점
    const near = nearbyPlatforms(tt, 35.0027, 139.0);
    expect(near).toHaveLength(1);
    expect(near[0].stop).toBe(0);
    expect(near[0].walkSecs).toBeGreaterThan(200); // ~300m × 1.3 / 1.33m/s ≈ 290s
    expect(near[0].walkSecs).toBeLessThan(400);
  });

  it("1km 밖 3km 안이면 최근접 1개만", () => {
    const near = nearbyPlatforms(tt, 35.018, 139.0); // A에서 약 2km
    expect(near).toHaveLength(1);
    expect(near[0].stop).toBe(0);
  });

  it("3km 밖이면 빈 배열", () => {
    expect(nearbyPlatforms(tt, 35.05, 139.0)).toHaveLength(0);
  });
});

describe("journeyToResult", () => {
  const journeys = raptor(tt, {
    sources: [{ stop: 0, offsetSecs: 0 }],
    targets: [{ stop: 2, offsetSecs: 0 }],
    departureSecs: h(8, 50),
    date: 20260901,
  });
  const result = journeyToResult(tt, journeys[0], 120, 180);

  it("접근/이탈 도보 + 열차 leg를 TransitStep으로 변환", () => {
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]).toEqual({ type: "walk", lineName: "도보", minutes: 2 });
    expect(result.steps[1].type).toBe("train");
    expect(result.steps[1].lineName).toBe("R1선");
    expect(result.steps[1].fromStation).toBe("A역");
    expect(result.steps[1].toStation).toBe("C역");
    expect(result.steps[1].minutes).toBe(20);
    expect(result.steps[1].color).toBe("#FF0000");
    expect(result.steps[2]).toEqual({ type: "walk", lineName: "도보", minutes: 3 });
  });

  it("정차역 좌표 폴리라인 (중간 정차역 포함)", () => {
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0].points).toHaveLength(3); // A, B, C
    expect(result.paths[0].color).toBe("#FF0000");
  });

  it("이동 시간 = 접근 도보 + 승차구간 + 이탈 도보 (대기 제외)", () => {
    // 120s + 20분 + 180s = 25분
    expect(result.durationMinutes).toBe(25);
  });

  it("60초 이하의 도보는 step 생략", () => {
    const r = journeyToResult(tt, journeys[0], 30, 0);
    expect(r.steps.every((s) => s.type === "train")).toBe(true);
  });
});
