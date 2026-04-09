"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { Place } from "./types";

interface PlacesContextValue {
  places: Place[];
  addPlace: (place: Omit<Place, "id" | "order">) => void;
  removePlace: (id: string) => void;
  updateStayMinutes: (id: string, minutes: number) => void;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<Place[]>([]);

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
      // order 재정렬
      return filtered.map((p, i) => ({ ...p, order: i + 1 }));
    });
  }, []);

  const updateStayMinutes = useCallback((id: string, minutes: number) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stayMinutes: minutes } : p))
    );
  }, []);

  return (
    <PlacesContext.Provider
      value={{ places, addPlace, removePlace, updateStayMinutes }}
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
