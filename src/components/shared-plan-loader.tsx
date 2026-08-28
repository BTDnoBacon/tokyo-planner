"use client";

import { useEffect, useRef } from "react";
import { usePlaces } from "@/lib/places-context";
import { useRoutes } from "@/lib/routes-context";
import { decodePlanFromHash, HASH_PREFIX } from "@/lib/share";

/**
 * 공유 링크(#plan=…)로 접속하면 일정을 불러온다.
 * - draft 복원(draftLoaded) 이후에만 동작 — 복원 전의 빈 플랜을 보고 확인을 건너뛰는 레이스 방지
 * - 작성 중인 플랜이 있으면 확인. 거절하면 해시를 남겨 (새로고침으로) 다시 불러올 수 있다
 * - 불러오면 활성 루트 표시를 해제 (공유 플랜이 기존 저장 루트로 위장하지 않게)
 * - 최초 로드와 hash-only 이동(주소창 붙여넣기) 모두 처리
 */
export default function SharedPlanLoader() {
  const { days, draftLoaded, loadFromDays, setStartHour } = usePlaces();
  const { setActiveRouteId } = useRoutes();

  // 확인 시점의 최신 플랜 내용 (이벤트 핸들러가 stale closure를 잡지 않게)
  const daysRef = useRef(days);
  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  useEffect(() => {
    if (!draftLoaded) return;

    const handle = async () => {
      if (!location.hash.startsWith(HASH_PREFIX)) return;
      const shared = await decodePlanFromHash(location.hash);
      if (!shared) {
        // 깨진 링크 — 반복 시도를 막기 위해 해시만 제거
        history.replaceState(null, "", location.pathname + location.search);
        return;
      }

      const hasContent = daysRef.current.some((d) => d.places.length > 0);
      const label = shared.name ? `'${shared.name}' 일정` : "공유받은 일정";
      if (hasContent && !window.confirm(`${label}을 불러올까요? 현재 작성 중인 플랜을 대체합니다.`)) {
        return; // 거절 — 해시 유지 (공유 링크를 잃지 않도록)
      }
      history.replaceState(null, "", location.pathname + location.search);
      setActiveRouteId(null);
      loadFromDays(shared.days);
      setStartHour(shared.startHour);
    };

    void handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, [draftLoaded, loadFromDays, setStartHour, setActiveRouteId]);

  return null;
}
