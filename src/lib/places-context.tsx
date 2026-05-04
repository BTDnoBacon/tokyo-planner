"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { Place, Transit, TransportMode } from "./types";

interface PlacesContextValue {
  places: Place[];
  transits: Transit[];
  addPlace: (place: Omit<Place, "id" | "order">) => void;
  removePlace: (id: string) => void;
  updateStayMinutes: (id: string, minutes: number) => void;
  renamePlace: (id: string, name: string) => void;
  updateTransit: (fromId: string, toId: string, mode: TransportMode, minutes: number) => void;
  loadFromRoute: (places: Place[], transits: Transit[]) => void;
  clearAll: () => void;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [transits, setTransits] = useState<Transit[]>([]);

  const addPlace = useCallback((place: Omit<Place, "id" | "order">) => {
    setPlaces((prev) => [
      ...prev,
      {
        ...place,
        id: crypto.randomUUID(),
        order: prev.length + 1,
      },
    ]);
  }, []);

  const removePlace = useCallback((id: string) => {
    setPlaces((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return filtered.map((p, i) => ({ ...p, order: i + 1 }));
    });
    setTransits((prev) => prev.filter((t) => t.fromId !== id && t.toId !== id));
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

  const updateTransit = useCallback(
    (fromId: string, toId: string, mode: TransportMode, minutes: number) => {
      setTransits((prev) => {
        const exists = prev.findIndex(
          (t) => t.fromId === fromId && t.toId === toId
        );
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

  // 저장된 루트 불러오기 — 현재 편집 상태를 루트 데이터로 교체
  const loadFromRoute = useCallback((newPlaces: Place[], newTransits: Transit[]) => {
    setPlaces(newPlaces);
    setTransits(newTransits);
  }, []);

  const clearAll = useCallback(() => {
    setPlaces([]);
    setTransits([]);
  }, []);

  return (
    <PlacesContext.Provider
      value={{ places, transits, addPlace, removePlace, updateStayMinutes, renamePlace, updateTransit, loadFromRoute, clearAll }}
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
