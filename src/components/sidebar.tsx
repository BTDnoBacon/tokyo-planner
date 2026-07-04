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

type Tab = "장소" | "타임라인";

export default function Sidebar() {
  const [tab, setTab] = useState<Tab>("장소");
  const { setActiveRouteId, routes, activeRouteId } = useRoutes();
  const { clearAll } = usePlaces();
  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? null;

  function handleNewRoute() {
    setActiveRouteId(null);
    clearAll();
  }

  return (
    <aside className="w-80 shrink-0 flex flex-col border-r border-zinc-200 bg-white">
      {/* 앱 헤더 */}
      <div className="px-5 py-4 border-b border-zinc-100 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">🗼 Tokyo Planner</h1>
          <button
            onClick={handleNewRoute}
            className="text-xs px-2.5 py-1 rounded-full border border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-500 transition-colors"
          >
            + 새 루트
          </button>
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
            onClick={() => setTab(t)}
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
