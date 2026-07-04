import type { Route, Place, Transit } from "./types";

const KEY = "tokyo-planner-routes";

/** TASK-001 이전 형태: days 없이 places/transits를 직접 가진 레거시 레코드 */
type LegacyRoute = Omit<Route, "days"> & {
  places: Place[];
  transits: Transit[];
};

function migrateRoute(record: Route | LegacyRoute): Route {
  if ("days" in record && Array.isArray(record.days)) {
    return record as Route;
  }
  const { places, transits, ...rest } = record as LegacyRoute;
  return {
    ...rest,
    days: [{ places: places ?? [], transits: transits ?? [] }],
  };
}

export function loadRoutes(): Route[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as (Route | LegacyRoute)[]).map(migrateRoute);
  } catch {
    return [];
  }
}

export function saveRoutes(routes: Route[]): void {
  localStorage.setItem(KEY, JSON.stringify(routes));
}
