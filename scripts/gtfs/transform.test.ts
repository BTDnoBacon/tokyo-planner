import { describe, it, expect } from "vitest";
import { buildTimetable, haversineMeters, walkSeconds, type GtfsInput } from "./transform";
import { serializeTimetable, deserializeTimetable } from "../../src/lib/engine/format";
import type { ServiceCalendar } from "../../src/lib/engine/types";

const svc: ServiceCalendar = {
  id: "Weekday",
  weekdays: 0b0011111,
  startDate: 20260824,
  endDate: 20270824,
  addedDates: [],
  removedDates: [],
};

/** 소형 합성 피드: A—B—C 노선 (각역정차 2편 + B를 통과하는 급행 1편) + 인근 정류장 D */
function makeInput(): GtfsInput {
  return {
    stops: [
      { id: "A", name: "A駅", nameKo: "에이", nameEn: "A", lat: 35.0, lon: 139.0, isStation: false, parentId: "" },
      { id: "B", name: "B駅", nameKo: "비", nameEn: "B", lat: 35.01, lon: 139.0, isStation: false, parentId: "ST" },
      { id: "C", name: "C駅", nameKo: "시", nameEn: "C", lat: 35.02, lon: 139.0, isStation: false, parentId: "" },
      // D는 B에서 약 200m 거리 (경도 0.0022도 ≈ 200m)
      { id: "D", name: "D駅", nameKo: "디", nameEn: "D", lat: 35.01, lon: 139.0022, isStation: false, parentId: "ST" },
      { id: "ST", name: "B統合駅", nameKo: "비역", nameEn: "B Sta", lat: 35.01, lon: 139.0001, isStation: true, parentId: "" },
    ],
    routes: [
      { id: "L1", agencyId: "Ag", shortName: "L1", longName: "라인1", type: 2, color: "FF0000", textColor: "FFFFFF" },
    ],
    trips: [
      { id: "t1", routeId: "L1", serviceId: "Weekday", headsign: "C행", stopTimes: [
        0, 0, 32400, 32400, // A 09:00
        1, 1, 32700, 32760, // B 09:05/09:06
        2, 2, 33000, 33000, // C 09:10
      ] },
      { id: "t2", routeId: "L1", serviceId: "Weekday", headsign: "C행", stopTimes: [
        // 순서 섞인 입력 — seq로 정렬되는지 검증
        2, 2, 34800, 34800, // C 09:40
        0, 0, 34200, 34200, // A 09:30
        1, 1, 34500, 34560, // B
      ] },
      { id: "express", routeId: "L1", serviceId: "Weekday", headsign: "C행 급행", stopTimes: [
        0, 0, 33600, 33600, // A 09:20
        2, 2, 34000, 34000, // C (B 통과)
      ] },
    ],
    continuations: [["t1", "t2"]],
    services: [svc],
  };
}

describe("buildTimetable", () => {
  const t = buildTimetable(makeInput());

  it("정차 패턴이 같은 trip은 같은 raptor route, 다르면 분리", () => {
    // 각역(A,B,C) 1개 + 급행(A,C) 1개 = raptor route 2개
    expect(t.routeStopsIndex.length - 1).toBe(2);
    expect(t.tripIds.length).toBe(3);
  });

  it("route 내 trip은 첫 출발시각 오름차순", () => {
    // 각역정차 route의 trips: t1(09:00) → t2(09:30)
    const r = t.tripRouteIndex[t.tripIds.indexOf("t1")];
    const [from, to] = [t.routeTripsIndex[r], t.routeTripsIndex[r + 1]];
    const deps = [];
    for (let i = from; i < to; i++) deps.push(t.stopTimes[t.tripTimesIndex[i] + 1]);
    expect(deps).toEqual([...deps].sort((a, b) => a - b));
  });

  it("stop_sequence가 섞인 입력도 정렬되어 저장", () => {
    const t2 = t.tripIds.indexOf("t2");
    const off = t.tripTimesIndex[t2];
    // A(34200) → B(34500) → C(34800) 순
    expect(t.stopTimes[off]).toBe(34200);
    expect(t.stopTimes[off + 2]).toBe(34500);
    expect(t.stopTimes[off + 4]).toBe(34800);
  });

  it("stop → raptor routes 역인덱스", () => {
    const bIdx = 1; // stop B
    const routesAtB = t.stopRoutesIndex[bIdx + 1] - t.stopRoutesIndex[bIdx];
    expect(routesAtB).toBe(1); // 급행은 B를 통과하므로 각역 route만
    const aIdx = 0;
    expect(t.stopRoutesIndex[aIdx + 1] - t.stopRoutesIndex[aIdx]).toBe(2);
  });

  it("직통운전 매핑", () => {
    const t1 = t.tripIds.indexOf("t1");
    const t2 = t.tripIds.indexOf("t2");
    expect(t.tripContinuation[t1]).toBe(t2);
    expect(t.tripContinuation[t2]).toBe(-1);
  });

  it("도보 환승: 인근 정류장 대칭 연결, 역 그룹 노드는 제외", () => {
    const bIdx = 1;
    const dIdx = 3;
    const bTransfers = [];
    for (let i = t.transfersIndex[bIdx]; i < t.transfersIndex[bIdx + 1]; i++) {
      bTransfers.push(t.transfersTo[i]);
    }
    expect(bTransfers).toContain(dIdx); // B ↔ D (약 200m)
    const dTransfers = [];
    for (let i = t.transfersIndex[dIdx]; i < t.transfersIndex[dIdx + 1]; i++) {
      dTransfers.push(t.transfersTo[i]);
    }
    expect(dTransfers).toContain(bIdx); // 대칭
    const stIdx = 4; // 그룹 노드
    expect(t.transfersIndex[stIdx + 1] - t.transfersIndex[stIdx]).toBe(0);
  });

  it("같은 parent 정류장은 최소 환승시간 하한 적용", () => {
    const bIdx = 1;
    for (let i = t.transfersIndex[bIdx]; i < t.transfersIndex[bIdx + 1]; i++) {
      if (t.transfersTo[i] === 3) expect(t.transfersSecs[i]).toBeGreaterThanOrEqual(120);
    }
  });

  it("멀리 떨어진 정류장(A-C 약 2.2km)은 연결하지 않음", () => {
    const aIdx = 0;
    for (let i = t.transfersIndex[aIdx]; i < t.transfersIndex[aIdx + 1]; i++) {
      expect(t.transfersTo[i]).not.toBe(2);
    }
  });

  it("알 수 없는 route/service 참조는 에러", () => {
    const bad = makeInput();
    bad.trips[0].routeId = "없는노선";
    expect(() => buildTimetable(bad)).toThrow();
  });
});

describe("serialize/deserialize 라운드트립", () => {
  it("모든 필드 보존", () => {
    const t = buildTimetable(makeInput());
    const restored = deserializeTimetable(serializeTimetable(t));
    expect(restored.stopIds).toEqual(t.stopIds);
    expect(restored.stopNamesKo).toEqual(t.stopNamesKo);
    expect(restored.routes).toEqual(t.routes);
    expect(restored.services).toEqual(t.services);
    expect([...restored.stopTimes]).toEqual([...t.stopTimes]);
    expect([...restored.stopLats]).toEqual([...t.stopLats]);
    expect([...restored.tripContinuation]).toEqual([...t.tripContinuation]);
    expect([...restored.transfersSecs]).toEqual([...t.transfersSecs]);
    expect([...restored.stopIsStation]).toEqual([...t.stopIsStation]);
  });

  it("정렬되지 않은 오프셋의 버퍼에서도 로드 (Node Buffer pool 재현)", () => {
    const t = buildTimetable(makeInput());
    const bin = serializeTimetable(t);
    const padded = new Uint8Array(bin.length + 3);
    padded.set(bin, 3);
    const view = padded.subarray(3); // byteOffset 3 — 8의 배수 아님
    const restored = deserializeTimetable(view);
    expect([...restored.stopLats]).toEqual([...t.stopLats]);
  });
});

describe("거리/도보시간", () => {
  it("haversine 대략값 (신주쿠→시부야 약 3.4km)", () => {
    const d = haversineMeters(35.6896, 139.7006, 35.658, 139.7016);
    expect(d).toBeGreaterThan(3000);
    expect(d).toBeLessThan(4000);
  });
  it("walkSeconds 하한", () => {
    expect(walkSeconds(0)).toBe(90);
    expect(walkSeconds(400)).toBeGreaterThan(300); // 400m × 1.3 / 1.33m/s + 30 ≈ 420s
  });
});
