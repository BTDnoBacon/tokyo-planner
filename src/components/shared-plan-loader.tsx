"use client";

import { useEffect, useRef } from "react";
import { usePlaces } from "@/lib/places-context";
import { decodePlanFromHash } from "@/lib/share";

/**
 * 공유 링크(#plan=…)로 접속하면 일정을 불러온다.
 * 최초 로드와 hash-only 이동(주소창 붙여넣기) 모두 처리. 작성 중인 플랜이 있으면
 * 덮어쓰기 전에 확인하고, 처리 후 해시는 URL에서 제거한다.
 * (디코딩이 비동기라 PlacesProvider의 draft 복원 이후에 적용됨)
 */
export default function SharedPlanLoader() {
  const { days, loadFromDays, setStartHour } = usePlaces();

  // 확인 시점의 최신 플랜 내용 (이벤트 핸들러가 stale closure를 잡지 않게)
  const daysRef = useRef(days);
  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  useEffect(() => {
    const handle = async () => {
      if (!location.hash.startsWith("#plan=")) return;
      const shared = await decodePlanFromHash(location.hash);
      // 해시는 성공/실패와 무관하게 제거 (새로고침 시 반복 확인 방지)
      history.replaceState(null, "", location.pathname + location.search);
      if (!shared) return;

      const hasContent = daysRef.current.some((d) => d.places.length > 0);
      const label = shared.name ? `'${shared.name}' 일정` : "공유받은 일정";
      if (hasContent && !window.confirm(`${label}을 불러올까요? 현재 작성 중인 플랜을 대체합니다.`)) {
        return;
      }
      loadFromDays(shared.days);
      setStartHour(shared.startHour);
    };
    void handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, [loadFromDays, setStartHour]);

  return null;
}
