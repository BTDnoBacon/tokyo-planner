"use client";

import { useEffect, useRef } from "react";
import { usePlaces } from "@/lib/places-context";
import { useTravelDate } from "@/lib/use-travel-date";
import { autoMode, computeSegment } from "@/lib/segment-calc";
import type { Place } from "@/lib/types";

/**
 * 구간 자동 계산 — 장소 추가/재정렬/일차 이동으로 이동수단이 비어 있는 인접 구간이
 * 생기면 자동으로 계산해 채운다 (거리 기반: ~800m 미만 도보, 이상 전철).
 *
 * 비동기 안전성: 결과는 계산을 시작한 일차에 setSegmentForDay(onlyIfAbsent)로 기록되어
 * (a) 일차 전환 중 도착해도 다른 일차를 오염시키지 않고 (b) 그 사이 사용자가 직접 고른
 * 모드를 덮어쓰지 않는다. 캐시(steps/paths)는 forDay 가드로 활성 일차일 때만 기록.
 * 실패한 구간은 attemptedRef에 기록해 재시도 폭주를 막는다 (모드 칩으로 수동 시도 가능).
 */
export default function AutoTransit() {
  const {
    places, transits, startHour, activeDayIndex,
    setSegmentForDay, setTransitSteps, setTransitPaths,
  } = usePlaces();
  const travelDate = useTravelDate();

  const attemptedRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());

  // 일차·날짜·시작시각이 바뀌면 실패 기록 초기화 (조건이 달라졌으니 재시도 가치 있음)
  useEffect(() => {
    attemptedRef.current.clear();
  }, [activeDayIndex, travelDate, startHour]);

  // 빈 구간 자동 채움
  useEffect(() => {
    const missing: [Place, Place][] = [];
    for (let i = 0; i < places.length - 1; i++) {
      const from = places[i];
      const to = places[i + 1];
      const key = `${from.id}-${to.id}`;
      if (transits.some((t) => t.fromId === from.id && t.toId === to.id)) continue;
      if (attemptedRef.current.has(key) || inFlightRef.current.has(key)) continue;
      missing.push([from, to]);
    }
    if (missing.length === 0) return;

    const day = activeDayIndex;
    missing.forEach(([from, to]) => inFlightRef.current.add(`${from.id}-${to.id}`));
    // 구간들은 독립 — 병렬 계산 후 일괄 기록 (구간당 재계산 낭비 없음)
    void Promise.all(
      missing.map(async ([from, to]) => {
        const key = `${from.id}-${to.id}`;
        try {
          const result = await computeSegment(autoMode(from, to), from, to, startHour, travelDate);
          if (result.ok) {
            setSegmentForDay(day, from.id, to.id, result.data.mode, result.data.minutes, {
              onlyIfAbsent: true,
            });
            if (result.data.steps?.length) setTransitSteps(from.id, to.id, result.data.steps, day);
            if (result.data.paths?.length) setTransitPaths(from.id, to.id, result.data.paths, day);
          } else {
            attemptedRef.current.add(key);
          }
        } finally {
          inFlightRef.current.delete(key);
        }
      })
    );
  }, [places, transits, startHour, travelDate, activeDayIndex, setSegmentForDay, setTransitSteps, setTransitPaths]);

  // 시작 시각·여행 날짜가 바뀌면 전철 구간은 시각표가 달라지므로 재계산 (도보/택시는 시간 무관)
  const prevScheduleRef = useRef<{ startHour: number; travelDate?: string } | null>(null);
  useEffect(() => {
    const prev = prevScheduleRef.current;
    prevScheduleRef.current = { startHour, travelDate };
    if (prev === null || (prev.startHour === startHour && prev.travelDate === travelDate)) return;

    const day = activeDayIndex;
    const targets: [Place, Place][] = [];
    for (let i = 0; i < places.length - 1; i++) {
      const t = transits.find((x) => x.fromId === places[i].id && x.toId === places[i + 1].id);
      if (t?.mode === "transit") targets.push([places[i], places[i + 1]]);
    }
    void Promise.all(
      targets.map(async ([from, to]) => {
        const result = await computeSegment("transit", from, to, startHour, travelDate);
        if (result.ok) {
          setSegmentForDay(day, from.id, to.id, "transit", result.data.minutes);
          if (result.data.steps?.length) setTransitSteps(from.id, to.id, result.data.steps, day);
          if (result.data.paths?.length) setTransitPaths(from.id, to.id, result.data.paths, day);
        }
      })
    );
    // places/transits는 의도적으로 제외 — 시각/날짜 "변경 시점"의 전철 구간만 갱신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startHour, travelDate]);

  return null;
}
