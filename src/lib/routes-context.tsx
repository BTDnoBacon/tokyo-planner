"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { Route, DayPlan } from "./types";
import { loadRoutes, saveRoutes, loadActiveRouteId, saveActiveRouteId } from "./storage";

interface RoutesContextValue {
  routes: Route[];
  activeRouteId: string | null;
  saveRoute: (name: string, date: string, days: DayPlan[]) => Route;
  loadRoute: (id: string) => Route | null;
  deleteRoute: (id: string) => void;
  updateRoute: (id: string, patch: Partial<Pick<Route, "name" | "date">>) => void;
  setActiveRouteId: (id: string | null) => void;
}

const RoutesContext = createContext<RoutesContextValue | null>(null);

export function RoutesProvider({ children }: { children: React.ReactNode }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  // 초기 로드 — 저장된 activeRouteId는 실제 존재하는 루트일 때만 복원
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       localStorage는 SSR에 없으므로 마운트 후 복원. lazy initializer는 하이드레이션 불일치 발생 */
    const loaded = loadRoutes();
    setRoutes(loaded);
    const savedId = loadActiveRouteId();
    if (savedId && loaded.some((r) => r.id === savedId)) {
      setActiveRouteId(savedId);
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveActiveRouteId(activeRouteId);
  }, [activeRouteId, hydrated]);

  const saveRoute = useCallback(
    (name: string, date: string, days: DayPlan[]): Route => {
      const route: Route = {
        id: crypto.randomUUID(),
        name,
        date,
        days,
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
