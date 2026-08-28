"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { DayPlan, Place, Transit, TransportMode, TransitStep } from "./types";
import type { TransitPath } from "./engine/geo";
import { loadDraft, saveDraft } from "./storage";

interface PlacesContextValue {
  places: Place[];
  transits: Transit[];
  days: DayPlan[];
  activeDayIndex: number;
  startHour: number;
  setStartHour: (hour: number) => void;
  /** localStorage draft 복원 완료 여부 — 복원 전에 플랜을 읽고 판단하면 안 되는 소비자용 */
  draftLoaded: boolean;
  /** 플랜 전체 교체(loadFromDays/clearAll) 시 증가 — 교체를 "변경"으로 오인하면 안 되는 effect용 */
  planGeneration: number;
  directionsResults: Record<string, google.maps.DirectionsResult>;
  transitSteps: Record<string, TransitStep[]>;
  transitPaths: Record<string, TransitPath[]>;
  /** forDay를 주면 그 일차에 추가 (비동기 콜백용 — 없으면 커밋 시점의 활성 일차). stayMinutes 기본 60 */
  addPlace: (place: AddPlaceInput, forDay?: number) => void;
  removePlace: (id: string) => void;
  reorderPlaces: (fromIndex: number, toIndex: number) => void;
  updateStayMinutes: (id: string, minutes: number) => void;
  renamePlace: (id: string, name: string) => void;
  updateMemo: (id: string, memo: string) => void;
  updateTransit: (fromId: string, toId: string, mode: TransportMode, minutes: number) => void;
  /**
   * 일차 지정 구간 쓰기 — 비동기 계산 결과용. 결과가 도착한 시점의 활성 일차가 아니라
   * 계산을 시작한 일차에 기록된다. onlyIfAbsent면 이미 항목이 있는 구간(사용자 선택 포함)을
   * 보호하기 위해 no-op.
   */
  setSegmentForDay: (
    dayIndex: number,
    fromId: string,
    toId: string,
    mode: TransportMode,
    minutes: number,
    opts?: { onlyIfAbsent?: boolean }
  ) => void;
  /** forDay를 주면 그 일차가 여전히 활성일 때만 캐시에 기록 (늦게 도착한 결과의 오염 방지) */
  setDirectionsResult: (fromId: string, toId: string, result: google.maps.DirectionsResult | null, forDay?: number) => void;
  setTransitSteps: (fromId: string, toId: string, steps: TransitStep[] | null, forDay?: number) => void;
  setTransitPaths: (fromId: string, toId: string, paths: TransitPath[] | null, forDay?: number) => void;
  movePlaceToDay: (placeId: string, targetDayIndex: number) => void;
  addDay: () => void;
  removeDay: (index: number) => void;
  setActiveDay: (index: number) => void;
  loadFromDays: (days: DayPlan[]) => void;
  clearAll: () => void;
}

export type AddPlaceInput = Omit<Place, "id" | "order" | "stayMinutes"> & {
  stayMinutes?: number;
};

const DEFAULT_STAY_MINUTES = 60;

const PlacesContext = createContext<PlacesContextValue | null>(null);

function createEmptyDay(): DayPlan {
  return { places: [], transits: [] };
}

// activeDayIndex는 항상 유효 범위로 유지되지만, 방어적 파생용 폴백 (렌더마다 새 객체 생성 방지)
const EMPTY_DAY: DayPlan = { places: [], transits: [] };

interface PlanState {
  days: DayPlan[];
  activeDayIndex: number;
  /** 타임라인 시작 시각(시) — 자동 계산의 출발 시각으로도 사용 */
  startHour: number;
}

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<PlanState>(() => ({
    days: [createEmptyDay()],
    activeDayIndex: 0,
    startHour: 9,
  }));
  const [directionsResults, setDirectionsResults] = useState<Record<string, google.maps.DirectionsResult>>({});
  const [transitSteps, setTransitStepsState] = useState<Record<string, TransitStep[]>>({});
  const [transitPaths, setTransitPathsState] = useState<Record<string, TransitPath[]>>({});
  // draft 복원 완료 전에는 저장하지 않음 — 초기 빈 상태가 기존 draft를 덮어쓰는 것 방지
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [planGeneration, setPlanGeneration] = useState(0);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       localStorage는 SSR에 없으므로 마운트 후 복원. lazy initializer는 하이드레이션 불일치 발생 */
    const draft = loadDraft();
    if (draft) {
      setPlan(draft);
      // 복원도 플랜 전체 교체 — 복원된 startHour가 "시각 변경"으로 오인돼 재계산되지 않게
      setPlanGeneration((g) => g + 1);
    }
    setDraftLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = setTimeout(() => saveDraft(plan), 400);
    return () => clearTimeout(timer);
  }, [plan, draftLoaded]);

  const { days, activeDayIndex, startHour } = plan;
  const activeDay = days[activeDayIndex] ?? EMPTY_DAY;
  const places = activeDay.places;
  const transits = activeDay.transits;

  // 비동기 결과 도착 시점의 활성 일차 확인용 (캐시 쓰기 가드)
  const activeDayRef = useRef(activeDayIndex);
  useEffect(() => {
    activeDayRef.current = activeDayIndex;
  }, [activeDayIndex]);

  // 경로 캐시(지도 경로/전철 상세/폴리라인) 정리 헬퍼
  const clearCachesFor = useCallback((placeId: string) => {
    const prune = <T,>(prev: Record<string, T>): Record<string, T> => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(placeId) || key.endsWith(placeId)) delete next[key];
      });
      return next;
    };
    setDirectionsResults(prune);
    setTransitStepsState(prune);
    setTransitPathsState(prune);
  }, []);

  const clearAllCaches = useCallback(() => {
    setDirectionsResults({});
    setTransitStepsState({});
    setTransitPathsState({});
  }, []);

  // 활성 일차만 변환하는 공통 헬퍼 — 항상 함수형 업데이트라 stale state 없음
  const updateActiveDay = useCallback((updater: (day: DayPlan) => DayPlan) => {
    setPlan((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => (i === prev.activeDayIndex ? updater(d) : d)),
    }));
  }, []);

  const addPlace = useCallback((place: AddPlaceInput, forDay?: number) => {
    setPlan((prev) => {
      const dayIndex = forDay ?? prev.activeDayIndex;
      const day = prev.days[dayIndex];
      if (!day) return prev;
      const entry: Place = {
        ...place,
        stayMinutes: place.stayMinutes ?? DEFAULT_STAY_MINUTES,
        id: crypto.randomUUID(),
        order: day.places.length + 1,
      };
      return {
        ...prev,
        days: prev.days.map((d, i) =>
          i === dayIndex ? { ...d, places: [...d.places, entry] } : d
        ),
      };
    });
  }, []);

  const removePlace = useCallback((id: string) => {
    updateActiveDay((day) => ({
      places: day.places
        .filter((p) => p.id !== id)
        .map((p, i) => ({ ...p, order: i + 1 })),
      transits: day.transits.filter((t) => t.fromId !== id && t.toId !== id),
    }));
    clearCachesFor(id);
  }, [updateActiveDay, clearCachesFor]);

  const reorderPlaces = useCallback((fromIndex: number, toIndex: number) => {
    updateActiveDay((day) => {
      const next = [...day.places];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...day, places: next.map((p, i) => ({ ...p, order: i + 1 })) };
    });
    // 순서 바뀌면 경로/steps 초기화
    clearAllCaches();
  }, [clearAllCaches,updateActiveDay]);

  const updateStayMinutes = useCallback((id: string, minutes: number) => {
    updateActiveDay((day) => ({
      ...day,
      places: day.places.map((p) => (p.id === id ? { ...p, stayMinutes: minutes } : p)),
    }));
  }, [updateActiveDay]);

  const renamePlace = useCallback((id: string, name: string) => {
    updateActiveDay((day) => ({
      ...day,
      places: day.places.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
  }, [updateActiveDay]);

  const updateMemo = useCallback((id: string, memo: string) => {
    const trimmed = memo.trim();
    updateActiveDay((day) => ({
      ...day,
      places: day.places.map((p) =>
        p.id === id ? { ...p, memo: trimmed === "" ? undefined : trimmed } : p
      ),
    }));
  }, [updateActiveDay]);

  const updateTransit = useCallback(
    (fromId: string, toId: string, mode: TransportMode, minutes: number) => {
      updateActiveDay((day) => {
        const exists = day.transits.findIndex((t) => t.fromId === fromId && t.toId === toId);
        if (exists >= 0) {
          const next = [...day.transits];
          next[exists] = { fromId, toId, mode, minutes };
          return { ...day, transits: next };
        }
        return { ...day, transits: [...day.transits, { fromId, toId, mode, minutes }] };
      });
    },
    [updateActiveDay]
  );

  const setSegmentForDay = useCallback(
    (
      dayIndex: number,
      fromId: string,
      toId: string,
      mode: TransportMode,
      minutes: number,
      opts?: { onlyIfAbsent?: boolean }
    ) => {
      setPlan((prev) => {
        const day = prev.days[dayIndex];
        if (!day) return prev;
        const exists = day.transits.findIndex((t) => t.fromId === fromId && t.toId === toId);
        if (exists >= 0 && opts?.onlyIfAbsent) return prev; // 기존 항목(사용자 선택) 보호
        // 해당 장소들이 아직 그 일차에 있는지 확인 (이동/삭제됐으면 폐기)
        if (!day.places.some((p) => p.id === fromId) || !day.places.some((p) => p.id === toId)) {
          return prev;
        }
        const entry = { fromId, toId, mode, minutes };
        const transits =
          exists >= 0
            ? day.transits.map((t, i) => (i === exists ? entry : t))
            : [...day.transits, entry];
        return {
          ...prev,
          days: prev.days.map((d, i) => (i === dayIndex ? { ...d, transits } : d)),
        };
      });
    },
    []
  );

  const setDirectionsResult = useCallback(
    (fromId: string, toId: string, result: google.maps.DirectionsResult | null, forDay?: number) => {
      if (forDay !== undefined && forDay !== activeDayRef.current) return;
      setDirectionsResults((prev) => {
        const key = `${fromId}-${toId}`;
        if (result === null) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: result };
      });
    },
    []
  );

  const setTransitSteps = useCallback(
    (fromId: string, toId: string, steps: TransitStep[] | null, forDay?: number) => {
      if (forDay !== undefined && forDay !== activeDayRef.current) return;
      setTransitStepsState((prev) => {
        const key = `${fromId}-${toId}`;
        if (steps === null) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: steps };
      });
    },
    []
  );

  const setStartHour = useCallback((hour: number) => {
    setPlan((prev) => ({ ...prev, startHour: hour }));
  }, []);

  const setTransitPaths = useCallback(
    (fromId: string, toId: string, paths: TransitPath[] | null, forDay?: number) => {
      if (forDay !== undefined && forDay !== activeDayRef.current) return;
      setTransitPathsState((prev) => {
        const key = `${fromId}-${toId}`;
        if (paths === null) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: paths };
      });
    },
    []
  );

  const movePlaceToDay = useCallback((placeId: string, targetDayIndex: number) => {
    // 렌더 상태 선가드 — no-op 케이스(동일 일차/범위 밖/장소 없음)에는 캐시도 건드리지 않음
    if (
      targetDayIndex === activeDayIndex ||
      targetDayIndex < 0 ||
      targetDayIndex >= days.length ||
      !places.some((p) => p.id === placeId)
    ) return;
    // 원 일차 제거 + 대상 일차 append를 단일 함수형 업데이트로 원자 처리
    setPlan((prev) => {
      const from = prev.activeDayIndex;
      if (targetDayIndex === from || targetDayIndex < 0 || targetDayIndex >= prev.days.length) {
        return prev;
      }
      const sourceDay = prev.days[from];
      const moved = sourceDay?.places.find((p) => p.id === placeId);
      if (!moved) return prev;
      return {
        ...prev,
        days: prev.days.map((day, i) => {
          if (i === from) {
            // removePlace와 동일한 정리: 관련 transit 제거 + order 재부여
            return {
              places: day.places
                .filter((p) => p.id !== placeId)
                .map((p, idx) => ({ ...p, order: idx + 1 })),
              transits: day.transits.filter((t) => t.fromId !== placeId && t.toId !== placeId),
            };
          }
          if (i === targetDayIndex) {
            // 대상 일차 끝에 append (memo/stayMinutes 유지, order 재부여)
            return {
              ...day,
              places: [...day.places, { ...moved, order: day.places.length + 1 }],
            };
          }
          return day;
        }),
      };
    });
    // removePlace와 동일한 캐시 정리 — 이동한 장소와 연결된 경로/steps 제거
    clearCachesFor(placeId);
  }, [days.length, activeDayIndex, places, clearCachesFor]);

  const addDay = useCallback(() => {
    setPlan((prev) => ({
      ...prev,
      days: [...prev.days, createEmptyDay()],
      activeDayIndex: prev.days.length,
    }));
    // 일차가 바뀌면 지도에는 활성 일차 경로만 보여야 하므로 캐시 초기화
    clearAllCaches();
  }, [clearAllCaches,]);

  const removeDay = useCallback((index: number) => {
    // 마지막 1개는 삭제 불가 + 범위 밖 인덱스 무시 (캐시도 건드리지 않음)
    if (days.length <= 1 || index < 0 || index >= days.length) return;
    setPlan((prev) => {
      if (prev.days.length <= 1 || index < 0 || index >= prev.days.length) return prev;
      const nextDays = prev.days.filter((_, i) => i !== index);
      let nextActive: number;
      if (index < prev.activeDayIndex) {
        // 활성 일차 앞이 삭제됨 → 같은 일차를 가리키도록 보정
        nextActive = prev.activeDayIndex - 1;
      } else if (index === prev.activeDayIndex) {
        // 활성 일차 삭제 → 인접 일차로 전환 (마지막이었으면 이전 일차)
        nextActive = Math.min(index, nextDays.length - 1);
      } else {
        nextActive = prev.activeDayIndex;
      }
      return { ...prev, days: nextDays, activeDayIndex: nextActive };
    });
    clearAllCaches();
  }, [clearAllCaches,days.length]);

  const setActiveDay = useCallback((index: number) => {
    if (index < 0 || index >= days.length || index === activeDayIndex) return;
    setPlan((prev) => {
      if (index < 0 || index >= prev.days.length || index === prev.activeDayIndex) return prev;
      return { ...prev, activeDayIndex: index };
    });
    clearAllCaches();
  }, [clearAllCaches,days.length, activeDayIndex]);

  const loadFromDays = useCallback((newDays: DayPlan[]) => {
    setPlan((prev) => ({
      ...prev,
      days: newDays.length > 0 ? newDays : [createEmptyDay()],
      activeDayIndex: 0,
    }));
    setPlanGeneration((g) => g + 1);
    clearAllCaches();
  }, [clearAllCaches,]);

  const clearAll = useCallback(() => {
    setPlan((prev) => ({ ...prev, days: [createEmptyDay()], activeDayIndex: 0 }));
    setPlanGeneration((g) => g + 1);
    clearAllCaches();
  }, [clearAllCaches,]);

  return (
    <PlacesContext.Provider
      value={{
        places, transits, days, activeDayIndex, startHour, setStartHour,
        draftLoaded, planGeneration,
        directionsResults, transitSteps, transitPaths,
        addPlace, removePlace, reorderPlaces, updateStayMinutes, renamePlace, updateMemo,
        updateTransit, setSegmentForDay, setDirectionsResult, setTransitSteps, setTransitPaths,
        movePlaceToDay, addDay, removeDay, setActiveDay, loadFromDays, clearAll,
      }}
    >
      {children}
    </PlacesContext.Provider>
  );
}

export function usePlaces() {
  const ctx = useContext(PlacesContext);
  if (!ctx) throw new Error("usePlaces must be used within PlacesProvider");
  return ctx;
}
