"use client";

import { useState } from "react";
import { useRoutes } from "@/lib/routes-context";
import { usePlaces } from "@/lib/places-context";

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${y}.${m}.${d}`;
}
import PlaceList from "@/components/place-list";
import Timeline from "@/components/timeline";
import RoutePanel from "@/components/route-panel";
import DayTabs from "@/components/day-tabs";
import ShareButton from "@/components/share-button";

type Tab = "장소" | "타임라인";

export default function Sidebar() {
  const [tab, setTab] = useState<Tab>("장소");
  // 모바일 바텀시트 펼침 상태 (데스크톱에서는 무시됨)
  const [sheetOpen, setSheetOpen] = useState(false);
  const { setActiveRouteId, routes, activeRouteId } = useRoutes();
  const { clearAll } = usePlaces();
  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? null;

  function handleNewRoute() {
    setActiveRouteId(null);
    clearAll();
  }

  return (
    <aside
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.15)] transition-[height] duration-300 ${
        sheetOpen ? "h-[75dvh]" : "h-40"
      } md:static md:order-first md:h-full md:w-80 md:shrink-0 md:rounded-none md:border-r md:border-t-0 md:pb-0 md:shadow-none`}
    >
      {/* 모바일 시트 핸들 */}
      <button
        onClick={() => setSheetOpen((v) => !v)}
        className="flex shrink-0 justify-center py-2 md:hidden"
        aria-label={sheetOpen ? "플래너 접기" : "플래너 펼치기"}
      >
        <span className="h-1 w-10 rounded-full bg-zinc-300" />
      </button>
      {/* 앱 헤더 */}
      <div className="px-5 py-4 border-b border-zinc-100 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">🗼 Tokyo Planner</h1>
          <div className="flex items-center gap-1.5">
            <ShareButton />
            <button
              onClick={handleNewRoute}
              className="text-xs px-2.5 py-1 rounded-full border border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-500 transition-colors"
            >
              + 새 루트
            </button>
          </div>
        </div>
        {activeRoute && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
            <p className="text-xs text-zinc-500 truncate">
              <span className="font-medium text-zinc-700">{activeRoute.name}</span>
              <span className="mx-1 text-zinc-300">·</span>
              {formatDate(activeRoute.date)}
            </p>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-zinc-100 shrink-0">
        {(["장소", "타임라인"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              // 모바일에서만: 접힌 상태에서 탭을 누르면 펼침 (데스크톱 클릭이 상태를 오염시키지 않게)
              if (window.matchMedia("(max-width: 767px)").matches) setSheetOpen(true);
            }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === t
                ? "text-zinc-900 border-b-2 border-zinc-800 -mb-px"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 일차 탭 */}
      <DayTabs />

      {/* 탭 컨텐츠 */}
      <div className="flex-1 overflow-y-auto">
        {tab === "장소" ? (
          <div className="flex flex-col h-full">
            <RoutePanel />
            <div className="flex-1 px-4 py-3">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">장소 목록</p>
              <PlaceList />
            </div>
          </div>
        ) : (
          <div className="px-4 py-3">
            <Timeline />
          </div>
        )}
      </div>
    </aside>
  );
}
