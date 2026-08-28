"use client";

import { useState } from "react";
import { usePlaces } from "@/lib/places-context";
import { useRoutes } from "@/lib/routes-context";
import { encodePlanToHash, shareSupported } from "@/lib/share";

/** 현재 플랜을 URL로 공유 — 모바일은 시스템 공유 시트, 데스크톱은 클립보드 복사 */
export default function ShareButton() {
  const { days, startHour } = usePlaces();
  const { routes, activeRouteId } = useRoutes();
  const [copied, setCopied] = useState(false);

  const totalPlaces = days.reduce((sum, d) => sum + d.places.length, 0);
  if (totalPlaces === 0 || !shareSupported()) return null;

  async function handleShare() {
    const activeRoute = routes.find((r) => r.id === activeRouteId) ?? null;
    const hash = await encodePlanToHash({ days, startHour, name: activeRoute?.name });
    // basePath/경로 프리픽스 배포에서도 링크가 살아있도록 현재 경로 유지
    const url = `${location.origin}${location.pathname}${hash}`;

    // 시스템 공유 시트는 모바일에서만 — 데스크톱은 클립보드가 예측 가능한 UX
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: "Tokyo Planner 일정", url });
        return;
      } catch (err) {
        // 사용자 취소(AbortError)만 종료 — 인앱 브라우저의 NotAllowedError 등은 클립보드로 폴백
        if ((err as DOMException)?.name === "AbortError") return;
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
