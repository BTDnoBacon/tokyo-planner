import { describe, it, expect } from "vitest";
import { encodePlanToHash, decodePlanFromHash, type SharedPlan } from "./share";
import type { DayPlan } from "./types";

const days: DayPlan[] = [
  {
    places: [
      { id: "a", name: "신주쿠역", lat: 35.6896, lng: 139.7006, stayMinutes: 60, order: 1, memo: "출발" },
      { id: "b", name: "센소지", lat: 35.7148, lng: 139.7967, stayMinutes: 90, order: 2 },
    ],
    transits: [{ fromId: "a", toId: "b", mode: "transit", minutes: 34 }],
  },
  {
    places: [{ id: "c", name: "도쿄타워", lat: 35.6586, lng: 139.7454, stayMinutes: 120, order: 1 }],
    transits: [],
  },
];

describe("plan URL 공유 인코딩", () => {
  it("라운드트립: 장소·메모·transit(새 UUID로 재연결)·startHour·이름 보존", async () => {
    const plan: SharedPlan = { days, startHour: 10, name: "도쿄 2박3일" };
    const hash = await encodePlanToHash(plan);
    expect(hash.startsWith("#plan=")).toBe(true);
    expect(hash.length).toBeLessThan(1000);

    const decoded = await decodePlanFromHash(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe("도쿄 2박3일");
    expect(decoded!.startHour).toBe(10);
    expect(decoded!.days).toHaveLength(2);

    const d0 = decoded!.days[0];
    expect(d0.places.map((p) => p.name)).toEqual(["신주쿠역", "센소지"]);
    expect(d0.places[0].memo).toBe("출발");
    expect(d0.places[1].memo).toBeUndefined();
    expect(d0.places[0].order).toBe(1);
    // transit이 새로 발급된 UUID로 올바르게 재연결됐는지
    expect(d0.transits).toHaveLength(1);
    expect(d0.transits[0].fromId).toBe(d0.places[0].id);
    expect(d0.transits[0].toId).toBe(d0.places[1].id);
    expect(d0.transits[0].mode).toBe("transit");
    expect(d0.transits[0].minutes).toBe(34);
    // UUID는 원본과 달라야 함 (충돌 방지)
    expect(d0.places[0].id).not.toBe("a");
  });

  it("잘못된 해시는 null (예외 없음)", async () => {
    expect(await decodePlanFromHash("#plan=%%%invalid")).toBeNull();
    expect(await decodePlanFromHash("#other=abc")).toBeNull();
    expect(await decodePlanFromHash("")).toBeNull();
  });

  it("깨진 페이로드(유효 base64지만 쓰레기)는 null", async () => {
    expect(await decodePlanFromHash("#plan=aGVsbG8")).toBeNull();
  });

  it("startHour 범위 클램프", async () => {
    const hash = await encodePlanToHash({ days, startHour: 99 });
    const decoded = await decodePlanFromHash(hash);
    expect(decoded!.startHour).toBe(23);
  });
});
