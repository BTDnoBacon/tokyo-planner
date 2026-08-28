"use client";

import { useEffect, useRef } from "react";
import { usePlaces } from "@/lib/places-context";
import { useTravelDate } from "@/lib/use-travel-date";
import { autoMode, computeSegment } from "@/lib/segment-calc";
import type { Place } from "@/lib/types";

/**
 * 구간 자동 계산 — 장소 추가/재정렬/일차 이동으로 이동수단이 비어 있는 인접 구간이
 * 생기면 자동으로 계산해 채운다 (거리 기반: ~800m 미만 도보, 이상 전철).
 * 자체 엔진이라 호출 비용이 없어 "이미 계산돼 있는" 상태가 기본이 된다.
 * 실패한 구간은 기록해 재시도 루프를 막고, 사용자가 모드 칩으로 수동 시도할 수 있다.
 */
export default function AutoTransit() {
  const {
    places, transits, startHour, activeDayIndex,
    updateTransit, setTransitSteps, setTransitPaths,
  } = usePlaces();
  const travelDate = useTravelDate();

  const attemptedRef = useRef<Set<string>>(new Set());
  const dayRef = useRef(activeDayIndex);

  // 일차·날짜가 바뀌면 실패 기록 초기화 (조건이 달라졌으니 재시도 가치 있음)
  useEffect(() => {
    dayRef.current = activeDayIndex;
    attemptedRef.current.clear();
  }, [activeDayIndex, travelDate]);

  useEffect(() => {
    const missing: [Place, Place][] = [];
    for (let i = 0; i < places.length - 1; i++) {
      const from = places[i];
      const to = places[i + 1];
      if (transits.some((t) => t.fromId === from.id && t.toId === to.id)) continue;
      if (attemptedRef.current.has(`${from.id}-${to.id}`)) continue;
      missing.push([from, to]);
    }
    if (missing.length === 0) return;

    const day = activeDayIndex;
    let cancelled = false;
    (async () => {
      for (const [from, to] of missing) {
        const result = await computeSegment(autoMode(from, to), from, to, startHour, travelDate);
        // 취소(effect 재실행)나 일차 전환이면 결과 폐기 — attempted에 기록하지 않아
        // 다음 effect 실행에서 재시도된다 (첫 구간 기록 후 재실행되는 정상 흐름)
        if (cancelled || dayRef.current !== day) break;
        if (result.ok) {
          updateTransit(from.id, to.id, result.data.mode, result.data.minutes);
          if (result.data.steps?.length) setTransitSteps(from.id, to.id, result.data.steps);
          if (result.data.paths?.length) setTransitPaths(from.id, to.id, result.data.paths);
        } else {
          // 진짜 실패만 기록해 재시도 루프 방지 (모드 칩으로 수동 시도 가능)
          attemptedRef.current.add(`${from.id}-${to.id}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [places, transits, startHour, travelDate, activeDayIndex, updateTransit, setTransitSteps, setTransitPaths]);

  return null;
}
