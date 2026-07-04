"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { Place, Transit, TransportMode, TransitStep } from "./types";

interface PlacesContextValue {
  places: Place[];
  transits: Transit[];
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
  loadFromRoute: (places: Place[], transits: Transit[]) => void;
  clearAll: () => void;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [transits, setTransits] = useState<Transit[]>([]);
  const [directionsResults, setDirectionsResults] = useState<Record<string, google.maps.DirectionsResult>>({});
  const [transitSteps, setTransitStepsState] = useState<Record<string, TransitStep[]>>({});

  const addPlace = useCallback((place: Omit<Place, "id" | "order">) => {
    setPlaces((prev) => [
      ...prev,
      { ...place, id: crypto.randomUUID(), order: prev.length + 1 },
    ]);
  }, []);

  const removePlace = useCallback((id: string) => {
    setPlaces((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return filtered.map((p, i) => ({ ...p, order: i + 1 }));
    });
    setTransits((prev) => prev.filter((t) => t.fromId !== id && t.toId !== id));
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
  }, []);

  const reorderPlaces = useCallback((fromIndex: number, toIndex: number) => {
    setPlaces((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((p, i) => ({ ...p, order: i + 1 }));
    });
    // 순서 바뀌면 경로/steps 초기화
    setDirectionsResults({});
    setTransitStepsState({});
  }, []);

  const updateStayMinutes = useCallback((id: string, minutes: number) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stayMinutes: minutes } : p))
    );
  }, []);

  const renamePlace = useCallback((id: string, name: string) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  }, []);

  const updateMemo = useCallback((id: string, memo: string) => {
    const trimmed = memo.trim();
    setPlaces((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, memo: trimmed === "" ? undefined : trimmed } : p
      )
    );
  }, []);

  const updateTransit = useCallback(
    (fromId: string, toId: string, mode: TransportMode, minutes: number) => {
      setTransits((prev) => {
        const exists = prev.findIndex((t) => t.fromId === fromId && t.toId === toId);
        if (exists >= 0) {
          const next = [...prev];
          next[exists] = { fromId, toId, mode, minutes };
          return next;
        }
        return [...prev, { fromId, toId, mode, minutes }];
      });
    },
    []
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

  const loadFromRoute = useCallback((newPlaces: Place[], newTransits: Transit[]) => {
    setPlaces(newPlaces);
    setTransits(newTransits);
    setDirectionsResults({});
    setTransitStepsState({});
  }, []);

  const clearAll = useCallback(() => {
    setPlaces([]);
    setTransits([]);
    setDirectionsResults({});
    setTransitStepsState({});
  }, []);

  return (
    <PlacesContext.Provider
      value={{
        places, transits, directionsResults, transitSteps,
        addPlace, removePlace, reorderPlaces, updateStayMinutes, renamePlace, updateMemo,
        updateTransit, setDirectionsResult, setTransitSteps, loadFromRoute, clearAll,
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
