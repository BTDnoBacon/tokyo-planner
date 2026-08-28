"use client";

import { useState } from "react";
import { usePlaces } from "@/lib/places-context";
import { useRoutes } from "@/lib/routes-context";
import { encodePlanToHash } from "@/lib/share";

/** 현재 플랜을 URL로 공유 — 클립보드 복사 (모바일은 시스템 공유 시트 우선) */
export default function ShareButton() {
  const { days, startHour } = usePlaces();
  const { routes, activeRouteId } = useRoutes();
  const [copied, setCopied] = useState(false);

  const totalPlaces = days.reduce((sum, d) => sum + d.places.length, 0);
  if (totalPlaces === 0) return null;

  async function handleShare() {
    const activeRoute = routes.find((r) => r.id === activeRouteId) ?? null;
    const hash = await encodePlanToHash({ days, startHour, name: activeRoute?.name });
    const url = `${location.origin}/${hash}`;

    // 시스템 공유 시트는 모바일에서만 — 데스크톱은 클립보드가 예측 가능한 UX
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: "Tokyo Planner 일정", url });
        return;
      } catch {
        /* 사용자가 취소 — 클립보드로 폴백하지 않음 */
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("링크를 복사하세요:", url);
    }
  }

  return (
    <button
      onClick={handleShare}
      className="text-xs px-2.5 py-1 rounded-full border border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-500 transition-colors"
      title="일정을 링크로 공유"
    >
      {copied ? "복사됨 ✓" : "공유"}
    </button>
  );
}
