import type { ServiceCalendar } from "./types";

/** "HH:MM:SS" → 자정 기준 초. GTFS는 심야 시각을 24시 이상으로 표기 (25:30:00 → 91800) */
export function parseGtfsTime(time: string): number {
  const [h, m, s] = time.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** YYYYMMDD 정수의 요일 비트 (bit 0=월 … bit 6=일) */
export function weekdayBit(date: number): number {
  const y = Math.floor(date / 10000);
  const m = Math.floor((date % 10000) / 100);
  const d = date % 100;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일 … 6=토
  return 1 << ((dow + 6) % 7); // 월요일을 bit 0으로
}

export function isServiceActiveOn(svc: ServiceCalendar, date: number): boolean {
  if (svc.removedDates.includes(date)) return false;
  if (svc.addedDates.includes(date)) return true;
  if (date < svc.startDate || date > svc.endDate) return false;
  return (svc.weekdays & weekdayBit(date)) !== 0;
}

/** 주어진 날짜에 운행하는 service 인덱스 집합 */
export function activeServices(services: ServiceCalendar[], date: number): Set<number> {
  const active = new Set<number>();
  services.forEach((svc, i) => {
    if (isServiceActiveOn(svc, date)) active.add(i);
  });
  return active;
}
