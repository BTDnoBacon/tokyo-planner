"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { Route, Place, Transit } from "./types";
import { loadRoutes, saveRoutes } from "./storage";

interface RoutesContextValue {
  routes: Route[];
  activeRouteId: string | null;
  saveRoute: (name: string, date: string, places: Place[], transits: Transit[]) => Route;
  loadRoute: (id: string) => Route | null;
  deleteRoute: (id: string) => void;
  updateRoute: (id: string, patch: Partial<Pick<Route, "name" | "date">>) => void;
  setActiveRouteId: (id: string | null) => void;
}

const RoutesContext = createContext<RoutesContextValue | null>(null);

export function RoutesProvider({ children }: { children: React.ReactNode }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  // 초기 로드
  useEffect(() => {
    setRoutes(loadRoutes());
  }, []);

  const saveRoute = useCallback(
    (name: string, date: string, places: Place[], transits: Transit[]): Route => {
      const route: Route = {
        id: crypto.randomUUID(),
        name,
        date,
        places,
        transits,
        createdAt: Date.now(),
      };
      setRoutes((prev) => {
        const next = [...prev, route];
        saveRoutes(next);
        return next;
      });
      return route;
    },
    []
  );

  const loadRoute = useCallback(
    (id: string): Route | null => {
      return routes.find((r) => r.id === id) ?? null;
    },
    [routes]
  );

  const deleteRoute = useCallback((id: string) => {
    setRoutes((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveRoutes(next);
      return next;
    });
    setActiveRouteId((prev) => (prev === id ? null : prev));
  }, []);

  const updateRoute = useCallback((id: string, patch: Partial<Pick<Route, "name" | "date">>) => {
    setRoutes((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      saveRoutes(next);
      return next;
    });
  }, []);

  return (
    <RoutesContext.Provider
      value={{ routes, activeRouteId, saveRoute, loadRoute, deleteRoute, updateRoute, setActiveRouteId }}
    >
      {children}
    </RoutesContext.Provider>
  );
}

export function useRoutes() {
  const ctx = useContext(RoutesContext);
  if (!ctx) throw new Error("useRoutes must be used within RoutesProvider");
  return ctx;
}
