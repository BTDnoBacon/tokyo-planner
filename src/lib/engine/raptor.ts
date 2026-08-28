/**
 * RAPTOR (Round-bAsed Public Transit Optimized Router) 구현.
 * Delling, Pajor, Werneck — "Round-Based Public Transit Routing" (ALENEX 2012).
 *
 * 라운드 k = 탑승 k회. 각 라운드에서 이전 라운드에 개선된 정류장을 지나는 raptor route를
 * 한 번씩 스캔하고, 라운드 끝에 도보 환승을 이완한다. 결과는 (도착시각 × 환승횟수) Pareto 집합.
 *
 * rRAPTOR (routeRange): 범위 내 출발 후보를 내림차순으로 순회하며 라벨 배열을 재사용 —
 * 늦은 출발의 라벨은 이른 출발에서도 유효(기다렸다 타면 됨)하므로 각 재실행은 개선분만
 * 탐색한다. 타겟 프루닝(>=)이 "늦게 출발해 같은 시각 도착" 지배 제거를 겸한다.
 *
 * 도쿄 특화: 직통운전(tripContinuation)은 trip 종점에서 다음 trip으로 탑승 카운트 없이
 * 이어진다 — route 스캔 중 종점에 도달한 차량을 continuation trip으로 계속 태운다.
 */
import type { Timetable } from "./types";
import { activeServices } from "./calendar";

const INF = 0x7fffffff;
/** 직통 체인 폭주 방지 (실데이터 최장 3~4개 회사 직통) */
const MAX_CONTINUATION_CHAIN = 8;

export interface RaptorQuery {
  /** 출발 후보 정류장들 — offsetSecs는 출발지→정류장 도보 시간 */
  sources: { stop: number; offsetSecs: number }[];
  /** 도착 후보 정류장들 — offsetSecs는 정류장→목적지 도보 시간 */
  targets: { stop: number; offsetSecs: number }[];
  /** 서비스일 기준 출발 초 (심야는 24h 이상으로 표현: 00:30 → 88200) */
  departureSecs: number;
  /** 서비스일 YYYYMMDD */
  date: number;
  /** 최대 환승 횟수 (기본 4) */
  maxTransfers?: number;
}

/** 출발시간 범위 질의 — [startSecs, endSecs]는 "출발지 기준" 출발 시각 범위 */
export interface RangeQuery {
  sources: { stop: number; offsetSecs: number }[];
  targets: { stop: number; offsetSecs: number }[];
  startSecs: number;
  endSecs: number;
  date: number;
  maxTransfers?: number;
}

export interface JourneyLeg {
  kind: "transit" | "walk";
  fromStop: number;
  toStop: number;
  departureSecs: number;
  arrivalSecs: number;
  /** transit 전용 — trip/raptor route 인덱스 */
  trip?: number;
  route?: number;
  /** 앞 leg에서 같은 차량으로 이어지는 직통운전 구간 (환승 아님) */
  inSeatContinuation?: boolean;
}

export interface Journey {
  departureSecs: number;
  arrivalSecs: number;
  transfers: number;
  legs: JourneyLeg[];
}

type Parent =
  | { kind: "source" }
  | { kind: "foot"; fromStop: number; walkSecs: number }
  | { kind: "transit"; trips: number[]; boardStop: number; boardPos: number; alightPos: number };

/** 해당 날짜에 운행하는 trip 마스크 */
function buildActiveTripMask(tt: Timetable, date: number): Uint8Array {
  const activeSvc = activeServices(tt.services, date);
  const mask = new Uint8Array(tt.tripIds.length);
  for (let t = 0; t < mask.length; t++) {
    if (activeSvc.has(tt.tripServiceIndex[t])) mask[t] = 1;
  }
  return mask;
}

interface EngineQuery {
  sources: { stop: number; offsetSecs: number }[];
  targets: { stop: number; offsetSecs: number }[];
  date: number;
  maxTransfers?: number;
}

/**
 * 라벨 배열을 유지한 채 여러 출발시각을 실행할 수 있는 RAPTOR 엔진.
 * runAt은 출발시각 내림차순으로 호출해야 라벨 재사용이 유효하다
 * (더 이른 출발은 기존 라벨을 개선만 할 수 있음).
 */
function createEngine(tt: Timetable, q: EngineQuery) {
  const nStops = tt.stopIds.length;
  const maxRounds = (q.maxTransfers ?? 4) + 1;
  const activeTrip = buildActiveTripMask(tt, q.date);

  // roundArr[k][s] = 탑승 k회로 s에 도착하는 최조 시각
  const roundArr: Int32Array[] = [];
  const parentRef: Int32Array[] = [];
  for (let k = 0; k <= maxRounds; k++) {
    roundArr.push(new Int32Array(nStops).fill(INF));
    parentRef.push(new Int32Array(nStops).fill(-1));
  }
  const parents: Parent[] = [];
  const best = new Int32Array(nStops).fill(INF); // 전 라운드 통틀어 최조 도착 (local pruning)

  const markedFlag = new Uint8Array(nStops);
  let markedList: number[] = [];
  const mark = (s: number) => {
    if (!markedFlag[s]) {
      markedFlag[s] = 1;
      markedList.push(s);
    }
  };

  const dep = (trip: number, pos: number) => tt.stopTimes[tt.tripTimesIndex[trip] + pos * 2 + 1];
  const arr = (trip: number, pos: number) => tt.stopTimes[tt.tripTimesIndex[trip] + pos * 2];

  // 타겟 프루닝 경계: 지금까지 알려진 최선의 목적지 도착 (재실행에서도 유효 — 도착은 개선만 됨)
  let targetBound = INF;
  const updateTargetBound = (k: number) => {
    for (const t of q.targets) {
      const a = roundArr[k][t.stop];
      if (a < INF && a + t.offsetSecs < targetBound) targetBound = a + t.offsetSecs;
    }
  };

  function runAt(departureSecs: number): void {
    markedFlag.fill(0);
    markedList = [];

    // ── 라운드 0: 출발지 초기화 + 도보 이완 ──
    for (const src of q.sources) {
      const t0 = departureSecs + src.offsetSecs;
      if (t0 < roundArr[0][src.stop]) {
        roundArr[0][src.stop] = t0;
        best[src.stop] = Math.min(best[src.stop], t0);
        parentRef[0][src.stop] = parents.push({ kind: "source" }) - 1;
        mark(src.stop);
      }
    }
    footpathPass(0);
    updateTargetBound(0);

    // ── 라운드 1..K ──
    for (let k = 1; k <= maxRounds && markedList.length > 0; k++) {
      // Q: 이전 라운드에 개선된 정류장이 속한 route → 최소 스캔 시작 위치
      const queue = new Map<number, number>();
      for (const s of markedList) {
        for (let i = tt.stopRoutesIndex[s]; i < tt.stopRoutesIndex[s + 1]; i++) {
          const r = tt.stopRoutes[i];
          const base = tt.routeStopsIndex[r];
          const end = tt.routeStopsIndex[r + 1];
          // s의 route 내 위치 (raptor route는 짧아서 선형 탐색으로 충분)
          for (let p = base; p < end; p++) {
            if (tt.routeStops[p] === s) {
              const pos = p - base;
              const prev = queue.get(r);
              if (prev === undefined || pos < prev) queue.set(r, pos);
              break;
            }
          }
        }
      }
      markedFlag.fill(0);
      markedList = [];

      const prev = roundArr[k - 1];
      const curr = roundArr[k];
      const pending: { trip: number; chain: number[]; boardStop: number; boardPos: number }[] = [];

      const improve = (s: number, time: number, parent: Parent) => {
        if (time >= best[s] || time >= targetBound) return;
        curr[s] = time;
        best[s] = time;
        parentRef[k][s] = parents.push(parent) - 1;
        mark(s);
      };

      for (const [r, startPos] of queue) {
        const base = tt.routeStopsIndex[r];
        const len = tt.routeStopsIndex[r + 1] - base;
        const tripsFrom = tt.routeTripsIndex[r];
        const tripsTo = tt.routeTripsIndex[r + 1];

        let curTrip = -1;
        let boardStop = -1;
        let boardPos = -1;

        for (let p = startPos; p < len; p++) {
          const s = tt.routeStops[base + p];

          if (curTrip >= 0) {
            improve(s, arr(curTrip, p), {
              kind: "transit",
              trips: [curTrip],
              boardStop,
              boardPos,
              alightPos: p,
            });
          }

          // 이전 라운드 도착으로 더 이른(또는 첫) 열차를 잡을 수 있으면 갈아탐
          const ready = prev[s];
          if (ready < INF && (curTrip === -1 || ready < dep(curTrip, p))) {
            let cand = -1;
            let candDep = curTrip >= 0 ? dep(curTrip, p) : INF;
            for (let ti = tripsFrom; ti < tripsTo; ti++) {
              if (!activeTrip[ti]) continue;
              const d = dep(ti, p);
              if (d >= ready && d < candDep) {
                candDep = d;
                cand = ti;
              }
            }
            if (cand >= 0) {
              curTrip = cand;
              boardStop = s;
              boardPos = p;
            }
          }
        }

        // 종점 도달 — 직통운전 이어타기
        if (curTrip >= 0 && tt.tripContinuation[curTrip] >= 0) {
          pending.push({
            trip: tt.tripContinuation[curTrip],
            chain: [curTrip],
            boardStop,
            boardPos,
          });
        }
      }

      // 직통운전 체인 처리 — 같은 라운드(탑승 카운트 불변)로 전파
      while (pending.length > 0) {
        const { trip, chain, boardStop, boardPos } = pending.pop()!;
        if (chain.length >= MAX_CONTINUATION_CHAIN || !activeTrip[trip]) continue;
        const r = tt.tripRouteIndex[trip];
        const base = tt.routeStopsIndex[r];
        const len = tt.routeStopsIndex[r + 1] - base;
        const nextChain = [...chain, trip];
        for (let p = 1; p < len; p++) {
          improve(tt.routeStops[base + p], arr(trip, p), {
            kind: "transit",
            trips: nextChain,
            boardStop,
            boardPos,
            alightPos: p,
          });
        }
        if (tt.tripContinuation[trip] >= 0) {
          pending.push({ trip: tt.tripContinuation[trip], chain: nextChain, boardStop, boardPos });
        }
      }

      footpathPass(k);
      updateTargetBound(k);
    }
  }

  // ── 도보 이완: 이번 라운드에 (열차/출발지로) 개선된 정류장에서 도보 환승 ──
  function footpathPass(k: number) {
    const snapshot = [...markedList];
    const arrs = roundArr[k];
    for (const s of snapshot) {
      for (let i = tt.transfersIndex[s]; i < tt.transfersIndex[s + 1]; i++) {
        const to = tt.transfersTo[i];
        const walkSecs = tt.transfersSecs[i];
        const time = arrs[s] + walkSecs;
        if (time < best[to] && time < targetBound && time < arrs[to]) {
          arrs[to] = time;
          best[to] = time;
          parentRef[k][to] = parents.push({ kind: "foot", fromStop: s, walkSecs }) - 1;
          mark(to);
        }
      }
    }
  }

  // ── 결과 추출: 라운드별 최선 타겟 도착 → Pareto → 경로 복원 ──
  function extract(fallbackDepartureSecs: number): Journey[] {
    const journeys: Journey[] = [];
    let bestSoFar = INF;
    for (let k = 0; k <= maxRounds; k++) {
      let bestStop = -1;
      let bestArrival = INF;
      for (const t of q.targets) {
        const a = roundArr[k][t.stop];
        if (a < INF && a + t.offsetSecs < bestArrival) {
          bestArrival = a + t.offsetSecs;
          bestStop = t.stop;
        }
      }
      if (bestStop < 0 || bestArrival >= bestSoFar) continue;
      bestSoFar = bestArrival;
      const legs = reconstruct(k, bestStop);
      if (k > 0 && legs.length === 0) continue; // 출발지 == 도착지 등 퇴화 케이스
      journeys.push({
        departureSecs: legs.length > 0 ? legs[0].departureSecs : fallbackDepartureSecs,
        arrivalSecs: bestArrival,
        transfers: Math.max(0, k - 1),
        legs,
      });
    }
    return journeys;
  }

  function reconstruct(k: number, stop: number): JourneyLeg[] {
    const legs: JourneyLeg[] = [];
    let cur = stop;
    let round = k;
    for (let guard = 0; guard < 64; guard++) {
      const ref = parentRef[round][cur];
      if (ref < 0) break;
      const rec = parents[ref];
      if (rec.kind === "source") break;

      if (rec.kind === "foot") {
        const from = rec.fromStop;
        const walkArr = roundArr[round][cur];
        legs.push({
          kind: "walk",
          fromStop: from,
          toStop: cur,
          departureSecs: walkArr - rec.walkSecs,
          arrivalSecs: walkArr,
        });
        cur = from; // 같은 라운드에서 계속 (foot의 부모는 transit/source)
        continue;
      }

      // transit — 직통 체인을 역순으로 leg 분해
      const { trips, boardPos, alightPos } = rec;
      for (let i = trips.length - 1; i >= 0; i--) {
        const trip = trips[i];
        const r = tt.tripRouteIndex[trip];
        const base = tt.routeStopsIndex[r];
        const len = tt.routeStopsIndex[r + 1] - base;
        const fromPos = i === 0 ? boardPos : 0;
        const toPos = i === trips.length - 1 ? alightPos : len - 1;
        legs.push({
          kind: "transit",
          fromStop: tt.routeStops[base + fromPos],
          toStop: tt.routeStops[base + toPos],
          departureSecs: dep(trip, fromPos),
          arrivalSecs: arr(trip, toPos),
          trip,
          route: r,
          inSeatContinuation: i > 0 ? true : undefined,
        });
      }
      cur = rec.boardStop;
      round -= 1;
    }
    return legs.reverse();
  }

  return { runAt, extract, activeTrip };
}

export function route(tt: Timetable, q: RaptorQuery): Journey[] {
  const engine = createEngine(tt, q);
  engine.runAt(q.departureSecs);
  return engine.extract(q.departureSecs);
}

/**
 * 출발 후보 시각 수집 — 소스 정류장(+도보 1홉 정류장)에서 범위 내에 떠나는
 * 모든 열차의 "출발지 기준" 출발 시각. 분 단위로 내림해 실행 횟수를 상한
 * (내린 시각의 탐색 결과는 상위집합이라 정확성은 유지). 내림차순 반환.
 */
function collectDepartureCandidates(
  tt: Timetable,
  q: RangeQuery,
  activeTrip: Uint8Array
): number[] {
  const taus = new Set<number>([q.startSecs]);
  const origins: { stop: number; offsetSecs: number }[] = [...q.sources];
  for (const s of q.sources) {
    for (let i = tt.transfersIndex[s.stop]; i < tt.transfersIndex[s.stop + 1]; i++) {
      origins.push({ stop: tt.transfersTo[i], offsetSecs: s.offsetSecs + tt.transfersSecs[i] });
    }
  }
  for (const { stop, offsetSecs } of origins) {
    const lo = q.startSecs + offsetSecs;
    const hi = q.endSecs + offsetSecs;
    for (let i = tt.stopRoutesIndex[stop]; i < tt.stopRoutesIndex[stop + 1]; i++) {
      const r = tt.stopRoutes[i];
      const base = tt.routeStopsIndex[r];
      const len = tt.routeStopsIndex[r + 1] - base;
      let pos = -1;
      for (let p = 0; p < len; p++) {
        if (tt.routeStops[base + p] === stop) {
          pos = p;
          break;
        }
      }
      if (pos < 0 || pos === len - 1) continue; // 종점 승차는 무의미
      for (let ti = tt.routeTripsIndex[r]; ti < tt.routeTripsIndex[r + 1]; ti++) {
        if (!activeTrip[ti]) continue;
        const d = tt.stopTimes[tt.tripTimesIndex[ti] + pos * 2 + 1];
        if (d >= lo && d <= hi) {
          taus.add(Math.max(q.startSecs, Math.floor((d - offsetSecs) / 60) * 60));
        }
      }
    }
  }
  return [...taus].sort((a, b) => b - a);
}

/**
 * rRAPTOR: 출발시간 범위 검색.
 * "출발지 기준" 출발 시각이 [startSecs, endSecs]인 여정들의 프로필 —
 * 더 늦게 출발하면서 같거나 이른 도착이 존재하는 여정은 제외(지배),
 * 출발 시각 오름차순으로 반환.
 * 주의: 지배자가 범위 "밖"(endSecs 직후 출발)인 엔트리도 생략된다 —
 * 타겟 프루닝의 자연스러운 결과로, 60분급 윈도에서는 끝 경계에서만 발생.
 */
export function routeRange(tt: Timetable, q: RangeQuery): Journey[] {
  const engine = createEngine(tt, q);
  const taus = collectDepartureCandidates(tt, q, engine.activeTrip);

  // 소스 정류장 → 접근 도보 (같은 정류장 중복 시 최소 오프셋)
  const sourceOffset = new Map<number, number>();
  for (const s of q.sources) {
    const prev = sourceOffset.get(s.stop);
    if (prev === undefined || s.offsetSecs < prev) sourceOffset.set(s.stop, s.offsetSecs);
  }
  /** 여정의 출발지 기준 출발 시각 (첫 leg 출발 − 접근 도보) */
  const originDep = (j: Journey) =>
    j.departureSecs - (sourceOffset.get(j.legs[0]?.fromStop ?? -1) ?? 0);

  const seen = new Set<string>();
  const collected: Journey[] = [];
  for (const tau of taus) {
    engine.runAt(tau);
    for (const j of engine.extract(tau)) {
      if (j.legs.length === 0) continue;
      const od = originDep(j);
      if (od < q.startSecs || od > q.endSecs) continue;
      const key = `${j.departureSecs}|${j.arrivalSecs}|${j.transfers}`;
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(j);
      }
    }
  }

  // 프로필 지배 필터: 출발 내림차순으로 훑으며 도착이 엄격히 개선될 때만 채택
  collected.sort((a, b) => originDep(b) - originDep(a) || a.arrivalSecs - b.arrivalSecs);
  const profile: Journey[] = [];
  let bestArrival = INF;
  for (const j of collected) {
    if (j.arrivalSecs < bestArrival) {
      profile.push(j);
      bestArrival = j.arrivalSecs;
    }
  }
  return profile.reverse();
}
