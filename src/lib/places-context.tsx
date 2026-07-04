"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { DayPlan, Place, Transit, TransportMode, TransitStep } from "./types";

interface PlacesContextValue {
  places: Place[];
  transits: Transit[];
  days: DayPlan[];
  activeDayIndex: number;
  directionsResults: Record<string, google.maps.DirectionsResult>;
  transitSteps: Record<string, TransitStep[]>;
  addPlace: (place: Omit<Place, "id" | "order">) => void;
  removePlace: (id: string) => void;
  reorderPlaces: (fromIndex: number, toIndex: number) => void;
  updateStayMinutes: (id: string, minutes: number) => void;
  renamePlace: (id: string, name: string) => void;
  updateMemo: (id: string, memo: string) => void;
  updateTransit: (fromId: string, toId: string, mode: TransportMode, minutes: number) => void;
  setDirectionsResult: (fromId: string, toId: string, result: google.maps.DirectionsResult | null) => void;
  setTransitSteps: (fromId: string, toId: string, steps: TransitStep[] | null) => void;
  addDay: () => void;
  removeDay: (index: number) => void;
  setActiveDay: (index: number) => void;
  loadFromDays: (days: DayPlan[]) => void;
  loadFromRoute: (places: Place[], transits: Transit[]) => void;
  clearAll: () => void;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

function createEmptyDay(): DayPlan {
  return { places: [], transits: [] };
}

// activeDayIndex는 항상 유효 범위로 유지되지만, 방어적 파생용 폴백 (렌더마다 새 객체 생성 방지)
const EMPTY_DAY: DayPlan = { places: [], transits: [] };

interface PlanState {
  days: DayPlan[];
  activeDayIndex: number;
}

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<PlanState>(() => ({
    days: [createEmptyDay()],
    activeDayIndex: 0,
  }));
  const [directionsResults, setDirectionsResults] = useState<Record<string, google.maps.DirectionsResult>>({});
  const [transitSteps, setTransitStepsState] = useState<Record<string, TransitStep[]>>({});

  const { days, activeDayIndex } = plan;
  const activeDay = days[activeDayIndex] ?? EMPTY_DAY;
  const places = activeDay.places;
  const transits = activeDay.transits;

  // 활성 일차만 변환하는 공통 헬퍼 — 항상 함수형 업데이트라 stale state 없음
  const updateActiveDay = useCallback((updater: (day: DayPlan) => DayPlan) => {
    setPlan((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => (i === prev.activeDayIndex ? updater(d) : d)),
    }));
  }, []);

  const addPlace = useCallback((place: Omit<Place, "id" | "order">) => {
    updateActiveDay((day) => ({
      ...day,
      places: [
        ...day.places,
        { ...place, id: crypto.randomUUID(), order: day.places.length + 1 },
      ],
    }));
  }, [updateActiveDay]);

  const removePlace = useCallback((id: string) => {
    updateActiveDay((day) => ({
      places: day.places
        .filter((p) => p.id !== id)
        .map((p, i) => ({ ...p, order: i + 1 })),
      transits: day.transits.filter((t) => t.fromId !== id && t.toId !== id),
    }));
    setDirectionsResults((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(id) || key.endsWith(id)) delete next[key];
      });
      return next;
    });
    setTransitStepsState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(id) || key.endsWith(id)) delete next[key];
      });
      return next;
    });
  }, [updateActiveDay]);

  const reorderPlaces = useCallback((fromIndex: number, toIndex: number) => {
    updateActiveDay((day) => {
      const next = [...day.places];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...day, places: next.map((p, i) => ({ ...p, order: i + 1 })) };
    });
    // 순서 바뀌면 경로/steps 초기화
    setDirectionsResults({});
    setTransitStepsState({});
  }, [updateActiveDay]);

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

  const setDirectionsResult = useCallback(
    (fromId: string, toId: string, result: google.maps.DirectionsResult | null) => {
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
    (fromId: string, toId: string, steps: TransitStep[] | null) => {
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

  const addDay = useCallback(() => {
    setPlan((prev) => ({
      days: [...prev.days, createEmptyDay()],
      activeDayIndex: prev.days.length,
    }));
    // 일차가 바뀌면 지도에는 활성 일차 경로만 보여야 하므로 캐시 초기화
    setDirectionsResults({});
    setTransitStepsState({});
  }, []);

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
      return { days: nextDays, activeDayIndex: nextActive };
    });
    setDirectionsResults({});
    setTransitStepsState({});
  }, [days.length]);

  const setActiveDay = useCallback((index: number) => {
    if (index < 0 || index >= days.length || index === activeDayIndex) return;
    setPlan((prev) => {
      if (index < 0 || index >= prev.days.length || index === prev.activeDayIndex) return prev;
      return { ...prev, activeDayIndex: index };
    });
    setDirectionsResults({});
    setTransitStepsState({});
  }, [days.length, activeDayIndex]);

  const loadFromDays = useCallback((newDays: DayPlan[]) => {
    setPlan({
      days: newDays.length > 0 ? newDays : [createEmptyDay()],
      activeDayIndex: 0,
    });
    setDirectionsResults({});
    setTransitStepsState({});
  }, []);

  // route-panel이 아직 사용 — 단일 일차로 전체 교체 (TASK-004에서 제거 예정)
  const loadFromRoute = useCallback((newPlaces: Place[], newTransits: Transit[]) => {
    setPlan({
      days: [{ places: newPlaces, transits: newTransits }],
      activeDayIndex: 0,
    });
    setDirectionsResults({});
    setTransitStepsState({});
  }, []);

  const clearAll = useCallback(() => {
    setPlan({ days: [createEmptyDay()], activeDayIndex: 0 });
    setDirectionsResults({});
    setTransitStepsState({});
  }, []);

  return (
    <PlacesContext.Provider
      value={{
        places, transits, days, activeDayIndex, directionsResults, transitSteps,
        addPlace, removePlace, reorderPlaces, updateStayMinutes, renamePlace, updateMemo,
        updateTransit, setDirectionsResult, setTransitSteps,
        addDay, removeDay, setActiveDay, loadFromDays, loadFromRoute, clearAll,
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
