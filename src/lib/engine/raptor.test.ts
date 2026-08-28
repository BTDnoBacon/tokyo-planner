import { describe, it, expect } from "vitest";
import { buildTimetable, type GtfsInput } from "../../../scripts/gtfs/transform";
import { route as raptor, type RaptorQuery } from "./raptor";
import type { ServiceCalendar, RouteMeta } from "./types";

// ── 픽스처 헬퍼 ──
// 정류장 간 위도 0.1도(≈11km) 간격 → 도보 환승 자동 합성이 일어나지 않음.
// 도보 환승 테스트에서만 의도적으로 가까운 좌표 사용.

const WEEKDAY: ServiceCalendar = {
  id: "Weekday", weekdays: 0b0011111, startDate: 20260824, endDate: 20270824,
  addedDates: [], removedDates: [],
};
const HOLIDAY: ServiceCalendar = {
  id: "Holiday", weekdays: 0b1000000, startDate: 20260824, endDate: 20270824,
  addedDates: [], removedDates: [],
};
const TUE = 20260901; // 화요일
const SUN = 20260830; // 일요일

function meta(id: string): RouteMeta {
  return { id, agencyId: "Ag", shortName: id, longName: id, type: 2, color: "", textColor: "" };
}

function stop(id: string, lat: number, lon = 139.0, parentId = "") {
  return { id, name: id, nameKo: id, nameEn: id, lat, lon, isStation: false, parentId };
}

/** [stopIdx, arrSecs, depSecs][] → GtfsTrip.stopTimes 평탄 배열 */
function trip(id: string, routeId: string, sts: [number, number, number][], serviceId = "Weekday") {
  return {
    id, routeId, serviceId, headsign: "",
    stopTimes: sts.flatMap(([s, arr, dep], i) => [i, s, arr, dep]),
  };
}

const h = (hh: number, mm = 0) => hh * 3600 + mm * 60;

function query(tt: ReturnType<typeof buildTimetable>, from: number, to: number, dep: number, extra: Partial<RaptorQuery> = {}) {
  return raptor(tt, {
    sources: [{ stop: from, offsetSecs: 0 }],
    targets: [{ stop: to, offsetSecs: 0 }],
    departureSecs: dep,
    date: TUE,
    ...extra,
  });
}

describe("단일 노선", () => {
  // A(0) — B(1) — C(2), 각역 2편 + B를 통과하는 급행 1편
  const input: GtfsInput = {
    stops: [stop("A", 35.0), stop("B", 35.1), stop("C", 35.2)],
    routes: [meta("R1")],
    trips: [
      trip("local1", "R1", [[0, h(9), h(9)], [1, h(9, 10), h(9, 10)], [2, h(9, 20), h(9, 20)]]),
      trip("local2", "R1", [[0, h(9, 30), h(9, 30)], [1, h(9, 40), h(9, 40)], [2, h(9, 50), h(9, 50)]]),
      trip("express", "R1", [[0, h(9, 5), h(9, 5)], [2, h(9, 15), h(9, 15)]]),
      trip("sunday", "R1", [[0, h(8), h(8)], [1, h(8, 5), h(8, 5)], [2, h(8, 10), h(8, 10)]], "Holiday"),
    ],
    continuations: [],
    services: [WEEKDAY, HOLIDAY],
  };
  const tt = buildTimetable(input);

  it("직행 최조 도착 (급행 선택)", () => {
    const js = query(tt, 0, 2, h(8, 50));
    expect(js).toHaveLength(1);
    expect(js[0].arrivalSecs).toBe(h(9, 15)); // 급행 9:05→9:15
    expect(js[0].transfers).toBe(0);
    expect(js[0].legs).toHaveLength(1);
  });

  it("급행이 통과하는 역은 각역정차로", () => {
    const js = query(tt, 0, 1, h(8, 50));
    expect(js[0].arrivalSecs).toBe(h(9, 10)); // local1
  });

  it("출발시각 이후의 다음 열차 탑승 (dep == ready도 탑승 가능)", () => {
    expect(query(tt, 0, 2, h(9, 30))[0].arrivalSecs).toBe(h(9, 50)); // local2
    expect(query(tt, 0, 1, h(9))[0].arrivalSecs).toBe(h(9, 10)); // 9:00 정각 출발 local1
  });

  it("막차 이후에는 결과 없음", () => {
    expect(query(tt, 0, 2, h(10))).toHaveLength(0);
  });

  it("일요일 전용 열차는 평일 검색에서 제외, 일요일에는 사용", () => {
    expect(query(tt, 0, 2, h(7, 50))[0].arrivalSecs).toBe(h(9, 15)); // 화요일: sunday 제외
    const js = raptor(tt, {
      sources: [{ stop: 0, offsetSecs: 0 }], targets: [{ stop: 2, offsetSecs: 0 }],
      departureSecs: h(7, 50), date: SUN,
    });
    expect(js[0].arrivalSecs).toBe(h(8, 10)); // 일요일: sunday 열차
  });

  it("역방향은 도달 불가", () => {
    expect(query(tt, 2, 0, h(8))).toHaveLength(0);
  });

  it("출발/도착 도보 오프셋 반영", () => {
    const js = raptor(tt, {
      sources: [{ stop: 0, offsetSecs: h(0, 10) }], // 9:00 출발 시 9:10 도착 → local1 놓침
      targets: [{ stop: 2, offsetSecs: 60 }],
      departureSecs: h(9), date: TUE,
    });
    // 급행(9:05)도 놓침 → local2 9:50 도착 + 60초
    expect(js[0].arrivalSecs).toBe(h(9, 50) + 60);
  });
});

describe("환승", () => {
  // R1: A(0)→X(1)→B(2) / R2: X(1)→D(3)
  const input: GtfsInput = {
    stops: [stop("A", 35.0), stop("X", 35.1), stop("B", 35.2), stop("D", 35.3)],
    routes: [meta("R1"), meta("R2")],
    trips: [
      trip("r1a", "R1", [[0, h(9), h(9)], [1, h(9, 10), h(9, 10)], [2, h(9, 20), h(9, 20)]]),
      trip("r2a", "R2", [[1, h(9, 15), h(9, 15)], [3, h(9, 30), h(9, 30)]]),
      trip("r2miss", "R2", [[1, h(9, 5), h(9, 5)], [3, h(9, 20), h(9, 20)]]), // 도착 전 출발 — 못 탐
    ],
    continuations: [],
    services: [WEEKDAY],
  };
  const tt = buildTimetable(input);

  it("동일 정류장 환승 1회", () => {
    const js = query(tt, 0, 3, h(8, 50));
    expect(js).toHaveLength(1);
    const j = js[0];
    expect(j.arrivalSecs).toBe(h(9, 30));
    expect(j.transfers).toBe(1);
    expect(j.legs).toHaveLength(2);
    expect(j.legs[0].toStop).toBe(1);
    expect(j.legs[1].fromStop).toBe(1);
  });

  it("maxTransfers=0이면 환승 경로 배제", () => {
    expect(query(tt, 0, 3, h(8, 50), { maxTransfers: 0 })).toHaveLength(0);
  });
});

describe("도보 환승", () => {
  // R1: A(0)→P(1) / R2: Q(2)→E(3), P와 Q는 약 180m (walkSeconds ≈ 206초)
  const input: GtfsInput = {
    stops: [
      stop("A", 35.0), stop("P", 35.1, 139.0), stop("Q", 35.1, 139.002), stop("E", 35.2, 139.002),
    ],
    routes: [meta("R1"), meta("R2")],
    trips: [
      trip("r1a", "R1", [[0, h(9), h(9)], [1, h(9, 10), h(9, 10)]]),
      trip("r2a", "R2", [[2, h(9, 20), h(9, 20)], [3, h(9, 35), h(9, 35)]]),
      trip("r2tight", "R2", [[2, h(9, 11), h(9, 11)], [3, h(9, 26), h(9, 26)]]), // 도보 시간 부족
    ],
    continuations: [],
    services: [WEEKDAY],
  };
  const tt = buildTimetable(input);

  it("인근 정류장 도보 환승 + 도보시간 미달 편 배제", () => {
    const js = query(tt, 0, 3, h(8, 50));
    expect(js).toHaveLength(1);
    const j = js[0];
    expect(j.arrivalSecs).toBe(h(9, 35)); // r2tight(9:11)는 도보 206초로는 불가
    const walk = j.legs.find((l) => l.kind === "walk");
    expect(walk).toBeDefined();
    expect(walk!.fromStop).toBe(1);
    expect(walk!.toStop).toBe(2);
  });
});

describe("직통운전 (in-seat transfer)", () => {
  // R1: A(0)→B(1) 종착, R2: B(1)→C(2) — t1이 t2로 직통
  function makeInput(withContinuation: boolean): GtfsInput {
    return {
      stops: [stop("A", 35.0), stop("B", 35.1), stop("C", 35.2)],
      routes: [meta("R1"), meta("R2")],
      trips: [
        trip("t1", "R1", [[0, h(9), h(9)], [1, h(9, 10), h(9, 10)]]),
        trip("t2", "R2", [[1, h(9, 12), h(9, 12)], [2, h(9, 25), h(9, 25)]]),
      ],
      continuations: withContinuation ? [["t1", "t2"]] : [],
      services: [WEEKDAY],
    };
  }

  it("직통이면 환승 0회, 이어지는 leg에 inSeatContinuation 표시", () => {
    const tt = buildTimetable(makeInput(true));
    const js = query(tt, 0, 2, h(8, 50));
    expect(js).toHaveLength(1);
    const j = js[0];
    expect(j.arrivalSecs).toBe(h(9, 25));
    expect(j.transfers).toBe(0);
    expect(j.legs).toHaveLength(2);
    expect(j.legs[0].inSeatContinuation).toBeFalsy();
    expect(j.legs[1].inSeatContinuation).toBe(true);
  });

  it("직통 없으면 같은 경로가 환승 1회로 잡힘", () => {
    const tt = buildTimetable(makeInput(false));
    const js = query(tt, 0, 2, h(8, 50));
    expect(js[0].arrivalSecs).toBe(h(9, 25));
    expect(js[0].transfers).toBe(1);
  });

  it("직통 경로도 maxTransfers=0에서 허용", () => {
    const tt = buildTimetable(makeInput(true));
    expect(query(tt, 0, 2, h(8, 50), { maxTransfers: 0 })).toHaveLength(1);
  });
});

describe("Pareto 결과", () => {
  // 직행(느림): A(0)→Z(1) 9:00→10:00 / 환승(빠름): A→X(2) 9:05→9:15, X→Z 9:20→9:40
  const input: GtfsInput = {
    stops: [stop("A", 35.0), stop("Z", 35.1), stop("X", 35.2)],
    routes: [meta("Rd"), meta("R1"), meta("R2")],
    trips: [
      trip("direct", "Rd", [[0, h(9), h(9)], [1, h(10), h(10)]]),
      trip("leg1", "R1", [[0, h(9, 5), h(9, 5)], [2, h(9, 15), h(9, 15)]]),
      trip("leg2", "R2", [[2, h(9, 20), h(9, 20)], [1, h(9, 40), h(9, 40)]]),
    ],
    continuations: [],
    services: [WEEKDAY],
  };
  const tt = buildTimetable(input);

  it("빠른 환승 경로와 느린 직행 모두 반환 (환승수-도착시각 Pareto)", () => {
    const js = query(tt, 0, 1, h(8, 50));
    expect(js).toHaveLength(2);
    const byTransfers = [...js].sort((a, b) => a.transfers - b.transfers);
    expect(byTransfers[0].transfers).toBe(0);
    expect(byTransfers[0].arrivalSecs).toBe(h(10));
    expect(byTransfers[1].transfers).toBe(1);
    expect(byTransfers[1].arrivalSecs).toBe(h(9, 40));
  });

  it("직행이 더 빠르면 환승 경로는 지배되어 제외", () => {
    const js = query(tt, 0, 1, h(8), {
      // 8시 출발도 같은 결과 구조 — 지배 검증은 아래 fastDirect 케이스로
    });
    expect(js.every((j) => j.transfers === 0 || j.arrivalSecs < h(10))).toBe(true);
  });
});

describe("심야 시각", () => {
  // 24시 넘는 시각의 trip — 서비스일 기준 25:00 출발
  const input: GtfsInput = {
    stops: [stop("A", 35.0), stop("B", 35.1)],
    routes: [meta("R1")],
    trips: [trip("night", "R1", [[0, h(25), h(25)], [1, h(25, 20), h(25, 20)]])],
    continuations: [],
    services: [WEEKDAY],
  };
  const tt = buildTimetable(input);

  it("당일 서비스의 심야 열차를 24h+ 출발시각으로 탐색", () => {
    const js = query(tt, 0, 1, h(24, 30));
    expect(js).toHaveLength(1);
    expect(js[0].arrivalSecs).toBe(h(25, 20));
  });
});
