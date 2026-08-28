import { describe, it, expect } from "vitest";
import { parseGtfsTime, weekdayBit, isServiceActiveOn, activeServices } from "./calendar";
import type { ServiceCalendar } from "./types";

describe("parseGtfsTime", () => {
  it("일반 시각", () => {
    expect(parseGtfsTime("09:30:00")).toBe(9 * 3600 + 30 * 60);
  });
  it("심야 시각 (24시 이상)", () => {
    expect(parseGtfsTime("25:30:00")).toBe(91800);
  });
  it("자정", () => {
    expect(parseGtfsTime("00:00:00")).toBe(0);
  });
});

describe("weekdayBit", () => {
  it("2026-09-01은 화요일 (bit 1)", () => {
    expect(weekdayBit(20260901)).toBe(1 << 1);
  });
  it("2026-08-30은 일요일 (bit 6)", () => {
    expect(weekdayBit(20260830)).toBe(1 << 6);
  });
  it("2026-08-31은 월요일 (bit 0)", () => {
    expect(weekdayBit(20260831)).toBe(1 << 0);
  });
});

const weekday: ServiceCalendar = {
  id: "Weekday",
  weekdays: 0b0011111, // 월~금
  startDate: 20260824,
  endDate: 20270824,
  addedDates: [],
  removedDates: [20260923], // 추분의 날 운휴 가정
};
const holiday: ServiceCalendar = {
  id: "Holiday",
  weekdays: 0b1000000, // 일
  startDate: 20260824,
  endDate: 20270824,
  addedDates: [20260923], // 공휴일에 추가 운행
  removedDates: [],
};

describe("isServiceActiveOn", () => {
  it("요일 매칭", () => {
    expect(isServiceActiveOn(weekday, 20260901)).toBe(true); // 화
    expect(isServiceActiveOn(weekday, 20260830)).toBe(false); // 일
  });
  it("기간 밖이면 false", () => {
    expect(isServiceActiveOn(weekday, 20280101)).toBe(false);
  });
  it("removedDates 우선", () => {
    expect(isServiceActiveOn(weekday, 20260923)).toBe(false); // 수요일이지만 운휴
  });
  it("addedDates는 요일과 무관하게 운행", () => {
    expect(isServiceActiveOn(holiday, 20260923)).toBe(true); // 수요일이지만 추가 운행
  });
});

describe("activeServices", () => {
  it("날짜에 맞는 서비스 인덱스 집합", () => {
    expect(activeServices([weekday, holiday], 20260923)).toEqual(new Set([1]));
    expect(activeServices([weekday, holiday], 20260901)).toEqual(new Set([0]));
  });
});
