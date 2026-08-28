import type { Route, Place, Transit, DayPlan } from "./types";

const KEY = "tokyo-planner-routes";
const DRAFT_KEY = "tokyo-planner-draft";
const ACTIVE_ROUTE_KEY = "tokyo-planner-active-route";

/** TASK-001 이전 형태: days 없이 places/transits를 직접 가진 레거시 레코드 */
type LegacyRoute = Omit<Route, "days"> & {
  places: Place[];
  transits: Transit[];
};

/** 각 day가 places/transits 배열을 갖춘 유효한 형태인지 — 손상된 값이 앱을 crash-loop에 빠뜨리는 것 방지 */
function sanitizeDays(days: unknown): DayPlan[] | null {
  if (!Array.isArray(days) || days.length === 0) return null;
  const valid = days.every(
    (d) => d && typeof d === "object" && Array.isArray(d.places) && Array.isArray(d.transits)
  );
  return valid ? (days as DayPlan[]) : null;
}

function migrateRoute(record: Route | LegacyRoute): Route {
  if ("days" in record) {
    const days = sanitizeDays(record.days);
    if (days) return { ...record, days } as Route;
  }
  const { places, transits, ...rest } = record as LegacyRoute;
  return {
    ...rest,
    days: [
      {
        places: Array.isArray(places) ? places : [],
        transits: Array.isArray(transits) ? transits : [],
      },
    ],
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
  /** 타임라인 시작 시각 (시) */
  startHour: number;
}

export function loadDraft(): DraftPlan | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const days = sanitizeDays(parsed?.days);
    if (!days) return null;
    const idx = typeof parsed.activeDayIndex === "number" ? parsed.activeDayIndex : 0;
    return {
      days,
      activeDayIndex: Math.min(Math.max(idx, 0), days.length - 1),
      startHour:
        typeof parsed.startHour === "number" && Number.isFinite(parsed.startHour)
          ? Math.min(23, Math.max(0, Math.round(parsed.startHour)))
          : 9,
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
