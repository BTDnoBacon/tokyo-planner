"use client";

import { useRoutes } from "@/lib/routes-context";
import { usePlaces } from "@/lib/places-context";

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${y}.${m}.${d}`;
}

export default function SidebarHeader() {
  const { routes, activeRouteId, setActiveRouteId } = useRoutes();
  const { clearAll } = usePlaces();

  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? null;

  function handleNewRoute() {
    setActiveRouteId(null);
    clearAll();
  }

  return (
    <div className="px-5 py-4 border-b border-zinc-100">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">🗼 Tokyo Planner</h1>
        {activeRouteId && (
          <button
            onClick={handleNewRoute}
            className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-400 hover:border-red-300 hover:text-red-400 transition-colors"
          >
            + 새 루트
          </button>
        )}
      </div>

      {activeRoute ? (
        <div className="mt-1 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
          <p className="text-xs text-zinc-500 truncate">
            <span className="font-medium text-zinc-700">{activeRoute.name}</span>
            <span className="mx-1">·</span>
            {formatDate(activeRoute.date)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-400 mt-0.5">지도에 장소를 추가해 일정을 만들어보세요</p>
      )}
    </div>
  );
}
