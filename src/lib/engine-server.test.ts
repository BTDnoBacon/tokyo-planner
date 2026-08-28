import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { computeTransitRoute, computeTransitDepartures } from "./engine-server";

// 실데이터 통합 스모크 — 바이너리가 빌드돼 있을 때만 실행 (pnpm data:build)
const hasBin = existsSync(join(process.cwd(), "data/engine/tokyo-rail.bin"));

describe.skipIf(!hasBin)("computeTransitRoute (실데이터)", () => {
  it("신주쿠역 → 도쿄역 좌표로 경로 반환", () => {
    // 신주쿠역 (35.6896, 139.7006) → 도쿄역 (35.6812, 139.7671)
    const result = computeTransitRoute(35.6896, 139.7006, 35.6812, 139.7671, 9);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.steps.length).toBeGreaterThan(0);
    expect(result.data.steps.some((s) => s.type === "train")).toBe(true);
    expect(result.data.durationMinutes).toBeGreaterThan(5);
    expect(result.data.durationMinutes).toBeLessThan(60);
    expect(result.data.paths.length).toBeGreaterThan(0);
  });

  it("역이 없는 좌표(보소반도 남쪽 해상)는 에러", () => {
    const result = computeTransitRoute(34.7, 139.9, 35.6812, 139.7671, 9);
    expect(result.ok).toBe(false);
  });

  it("같은 역 생활권 두 지점은 도보 폴백 (하드 실패 금지)", () => {
    // 신주쿠역 주변 ~250m 떨어진 두 지점
    const result = computeTransitRoute(35.6896, 139.7006, 35.6916, 139.7016, 9);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.steps.length).toBeGreaterThan(0);
    expect(result.data.steps.every((s) => s.type === "walk")).toBe(true);
    expect(result.data.durationMinutes).toBeLessThan(15);
  });

  it("여행 날짜(주말) 지정 시에도 경로 반환", () => {
    const result = computeTransitRoute(35.6896, 139.7006, 35.6812, 139.7671, 9, "2026-09-06");
    expect(result.ok).toBe(true);
  });

  it("시간표 범위 밖 날짜는 데이터 갱신 안내 에러", () => {
    const result = computeTransitRoute(35.6896, 139.7006, 35.6812, 139.7671, 9, "2028-01-01");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("갱신");
  });

  it("출발 시간대 프로필 (rRAPTOR) — 복수 출발, 오름차순, 도착 비퇴보", () => {
    // 신주쿠역 → 도쿄역, 09:00부터 1시간 (평일)
    const result = computeTransitDepartures(35.6896, 139.7006, 35.6812, 139.7671, 9 * 60, "2026-09-01");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 주오쾌속 빈도라면 1시간 안에 여러 출발이 있어야 함
    expect(result.data.length).toBeGreaterThan(2);
    for (let i = 1; i < result.data.length; i++) {
      // 출발 오름차순 + 늦게 출발하면 도착도 늦음 (프로필 지배 필터의 성질)
      expect(result.data[i].startSecs).toBeGreaterThan(result.data[i - 1].startSecs);
      expect(result.data[i].endSecs).toBeGreaterThan(result.data[i - 1].endSecs);
    }
    // 모든 엔트리가 윈도(1시간) 안에서 출발
    for (const opt of result.data) {
      expect(opt.startSecs).toBeGreaterThanOrEqual(9 * 3600);
      expect(opt.startSecs).toBeLessThanOrEqual(10 * 3600);
    }
  });
});
