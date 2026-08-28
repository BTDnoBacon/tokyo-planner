"use client";

import { useEffect, useState } from "react";
import { useRoutes } from "@/lib/routes-context";
import { usePlaces } from "@/lib/places-context";

function todayString() {
  // toISOString은 UTC라 KST 오전에는 어제 날짜가 나옴 — 로컬 기준 YYYY-MM-DD
  return new Date().toLocaleDateString("sv-SE");
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${y}.${m}.${d}`;
}

export default function RoutePanel() {
  const { routes, saveRoute, deleteRoute, updateRoute, setActiveRouteId, activeRouteId } = useRoutes();
  const { days, loadFromDays } = usePlaces();

  const [saving, setSaving] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeDate, setRouteDate] = useState(todayString());
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [overwriteSaved, setOverwriteSaved] = useState(false);

  // "저장됨 ✓" 피드백을 잠시 보여준 뒤 원복
  useEffect(() => {
    if (!overwriteSaved) return;
    const timer = setTimeout(() => setOverwriteSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [overwriteSaved]);

  // 전체 일차 통틀어 장소 수 — 저장 버튼 활성 조건
  const totalPlaceCount = days.reduce((sum, day) => sum + day.places.length, 0);

  function handleSave() {
    if (!routeName.trim() || totalPlaceCount === 0) return;
    const route = saveRoute(routeName.trim(), routeDate, days);
    setActiveRouteId(route.id);
    setSaving(false);
    setRouteName("");
  }

  // 활성 루트에 현재 편집 내용 덮어쓰기 — 이름·날짜는 유지
  function handleOverwrite() {
    if (!activeRouteId || totalPlaceCount === 0) return;
    updateRoute(activeRouteId, { days });
    setOverwriteSaved(true);
  }

  function handleLoad(id: string) {
    const route = routes.find((r) => r.id === id);
    if (!route) return;
    loadFromDays(route.days);
    setActiveRouteId(id);
  }

  return (
    <div className="px-4 py-3 border-b border-zinc-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">저장된 루트</span>
        <div className="flex items-center gap-1">
          {activeRouteId && (
            <button
              onClick={handleOverwrite}
              disabled={totalPlaceCount === 0}
              className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {overwriteSaved ? "저장됨 ✓" : "저장"}
            </button>
          )}
          <button
            onClick={() => setSaving((v) => !v)}
            disabled={totalPlaceCount === 0}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              activeRouteId
                ? "border border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-500"
                : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {saving ? "취소" : activeRouteId ? "+ 새 루트" : "+ 저장"}
          </button>
        </div>
      </div>

      {/* 저장 폼 */}
      {saving && (
        <div className="mb-3 space-y-1.5">
          <input
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="루트 이름 (예: 신주쿠 → 시부야)"
            className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-red-400 transition-colors"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <input
            type="date"
            value={routeDate}
            onChange={(e) => setRouteDate(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-red-400 transition-colors"
          />
          <button
            onClick={handleSave}
            disabled={!routeName.trim()}
            className="w-full rounded-lg bg-red-500 text-white text-sm py-1.5 hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            루트 저장
          </button>
        </div>
      )}

      {/* 저장된 루트 목록 */}
      {routes.length === 0 ? (
        <p className="text-xs text-zinc-400 py-2 text-center">저장된 루트가 없습니다</p>
      ) : (
        <ul className="space-y-1.5">
          {routes
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((route) => (
              <li
                key={route.id}
                className={`rounded-xl border px-3 py-2 transition-colors ${
                  activeRouteId === route.id
                    ? "border-red-300 bg-red-50"
                    : "border-zinc-100 bg-zinc-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div onClick={() => handleLoad(route.id)} className="flex-1 text-left min-w-0 cursor-pointer">
                    <p className="text-sm font-medium text-zinc-800 leading-snug truncate">{route.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {editingDateId === route.id ? (
                        <input
                          type="date"
                          defaultValue={route.date}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.value) updateRoute(route.id, { date: e.target.value });
                          }}
                          onBlur={() => setEditingDateId(null)}
                          className="text-xs border border-zinc-300 rounded px-1 py-0.5 outline-none focus:border-red-400 bg-white"
                        />
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingDateId(route.id); }}
                          className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
                          title="날짜 수정"
                        >
                          {formatDate(route.date)}
                        </button>
                      )}
                      <span className="text-xs text-zinc-300">·</span>
                      <span className="text-xs text-zinc-400">
                        {route.days.length}일차 · {route.days.reduce((sum, day) => sum + day.places.length, 0)}곳
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(`'${route.name}' 루트를 삭제할까요?`)) deleteRoute(route.id);
                    }}
                    className="shrink-0 text-zinc-300 hover:text-red-400 transition-colors text-base leading-none mt-0.5"
                    aria-label="루트 삭제"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
