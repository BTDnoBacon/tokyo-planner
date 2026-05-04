import type { Route } from "./types";

const KEY = "tokyo-planner-routes";

export function loadRoutes(): Route[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Route[];
  } catch {
    return [];
  }
}

export function saveRoutes(routes: Route[]): void {
  localStorage.setItem(KEY, JSON.stringify(routes));
}
