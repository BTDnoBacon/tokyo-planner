"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { Place, Transit, TransportMode } from "./types";

interface PlacesContextValue {
  places: Place[];
  transits: Transit[];
  // fromId-toId 키로 DirectionsResult 저장
  directionsResults: Record<string, google.maps.DirectionsResult>;
  addPlace: (place: Omit<Place, "id" | "order">) => void;
  removePlace: (id: string) => void;
  updateStayMinutes: (id: string, minutes: number) => void;
  renamePlace: (id: string, name: string) => void;
  updateTransit: (fromId: string, toId: string, mode: TransportMode, minutes: number) => void;
  setDirectionsResult: (fromId: string, toId: string, result: google.maps.DirectionsResult | null) => void;
  loadFromRoute: (places: Place[], transits: Transit[]) => void;
  clearAll: () => void;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [transits, setTransits] = useState<Transit[]>([]);
  const [directionsResults, setDirectionsResults] = useState<Record<string, google.maps.DirectionsResult>>({});

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

  const loadFromRoute = useCallback((newPlaces: Place[], newTransits: Transit[]) => {
    setPlaces(newPlaces);
    setTransits(newTransits);
    setDirectionsResults({});
  }, []);

  const clearAll = useCallback(() => {
    setPlaces([]);
    setTransits([]);
    setDirectionsResults({});
  }, []);

  return (
    <PlacesContext.Provider
      value={{
        places, transits, directionsResults,
        addPlace, removePlace, updateStayMinutes, renamePlace,
        updateTransit, setDirectionsResult, loadFromRoute, clearAll,
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
