"use client";

import { usePlaces } from "./places-context";
import { useRoutes } from "./routes-context";

/** "YYYY-MM-DD" + n일 */
export function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 활성 루트의 날짜 + 일차 → 이 일차의 실제 여행 날짜 (전철 캘린더용). 루트 미지정 시 undefined */
export function useTravelDate(): string | undefined {
  const { activeDayIndex } = usePlaces();
  const { routes, activeRouteId } = useRoutes();
  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? null;
  return activeRoute ? addDaysIso(activeRoute.date, activeDayIndex) : undefined;
}
