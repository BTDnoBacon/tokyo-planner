import type { Route, Place, Transit, DayPlan } from "./types";

const KEY = "tokyo-planner-routes";
const DRAFT_KEY = "tokyo-planner-draft";
const ACTIVE_ROUTE_KEY = "tokyo-planner-active-route";

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

/** 편집 중인 플랜 (저장 버튼과 무관하게 새로고침에도 유지되는 draft) */
export interface DraftPlan {
  days: DayPlan[];
  activeDayIndex: number;
}

export function loadDraft(): DraftPlan | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.days) || parsed.days.length === 0) return null;
    const idx = typeof parsed.activeDayIndex === "number" ? parsed.activeDayIndex : 0;
    return {
      days: parsed.days,
      activeDayIndex: Math.min(Math.max(idx, 0), parsed.days.length - 1),
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: DraftPlan): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 쿼터 초과 등 — draft는 유실돼도 치명적이지 않으므로 무시
  }
}

export function loadActiveRouteId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ROUTE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveRouteId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(ACTIVE_ROUTE_KEY);
    else localStorage.setItem(ACTIVE_ROUTE_KEY, id);
  } catch {
    // ignore
  }
}
