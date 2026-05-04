"use client";

import { useState } from "react";
import { usePlaces } from "@/lib/places-context";
import type { TransportMode } from "@/lib/types";

function formatTime(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

const TRANSPORT_OPTIONS: { mode: TransportMode; icon: string; label: string; defaultMin: number }[] = [
  { mode: "walk",    icon: "🚶", label: "도보",   defaultMin: 15 },
  { mode: "transit", icon: "🚃", label: "전철",   defaultMin: 10 },
  { mode: "taxi",    icon: "🚕", label: "택시",   defaultMin: 10 },
];

const START_HOUR_OPTIONS = [7, 8, 9, 10, 11] as const;

function TransitBlock({
  fromId,
  toId,
}: {
  fromId: string;
  toId: string;
}) {
  const { transits, updateTransit } = usePlaces();
  const transit = transits.find((t) => t.fromId === fromId && t.toId === toId);

  const currentMode: TransportMode = transit?.mode ?? "walk";
  const currentMin = transit?.minutes ?? 15;

  function handleModeClick(mode: TransportMode) {
    const defaultMin = TRANSPORT_OPTIONS.find((o) => o.mode === mode)!.defaultMin;
    updateTransit(fromId, toId, mode, transit?.minutes ?? defaultMin);
  }

  function handleMinChange(raw: string) {
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val > 0) updateTransit(fromId, toId, currentMode, val);
  }

  const currentOption = TRANSPORT_OPTIONS.find((o) => o.mode === currentMode)!;

  return (
    <li className="pl-4 pb-3 relative">
      <span className="absolute -left-px top-0 bottom-0 border-l border-dashed border-zinc-300" />
      <div className="ml-1 flex items-center gap-1.5 bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-1.5">
        {/* 수단 선택 */}
        <div className="flex gap-0.5">
          {TRANSPORT_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => handleModeClick(opt.mode)}
              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                currentMode === opt.mode
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-600"
              }`}
              title={opt.label}
            >
              {opt.icon}
            </button>
          ))}
        </div>
        <span className="text-zinc-300">·</span>
        {/* 시간 입력 */}
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            min={1}
            max={300}
            value={currentMin}
            onChange={(e) => handleMinChange(e.target.value)}
            className="w-9 text-center text-xs border border-zinc-200 rounded px-1 py-0.5 outline-none focus:border-zinc-400 bg-white"
          />
          <span className="text-xs text-zinc-400">분</span>
        </div>
        <span className="text-xs text-zinc-400 ml-0.5">{currentOption.icon} {currentOption.label}</span>
      </div>
    </li>
  );
}

export default function Timeline() {
  const { places, transits } = usePlaces();
  const [startHour, setStartHour] = useState(9);

  if (places.length === 0) {
    return (
      <p className="text-sm text-zinc-400 py-4 text-center">
        장소를 추가하면 타임라인이 생성됩니다
      </p>
    );
  }

  // 시간 계산 — 장소 체류 + 이동 시간 합산
  let cursor = startHour * 60;
  const blocks: { type: "place" | "transit"; key: string; start: number; end: number; placeIndex?: number; fromId?: string; toId?: string }[] = [];

  places.forEach((place, i) => {
    const start = cursor;
    const end = cursor + place.stayMinutes;
    blocks.push({ type: "place", key: place.id, start, end, placeIndex: i });
    cursor = end;

    if (i < places.length - 1) {
      const next = places[i + 1];
      const transit = transits.find((t) => t.fromId === place.id && t.toId === next.id);
      const tMin = transit?.minutes ?? 15;
      blocks.push({ type: "transit", key: `${place.id}-${next.id}`, start: cursor, end: cursor + tMin, fromId: place.id, toId: next.id });
      cursor += tMin;
    }
  });

  return (
    <div className="mt-2 space-y-1">
      {/* 시작 시간 선택 */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-xs text-zinc-400 shrink-0">시작</span>
        <div className="flex flex-wrap gap-1">
          {START_HOUR_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => setStartHour(h)}
              className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                startHour === h
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {h}시
            </button>
          ))}
        </div>
      </div>

      <ol className="relative border-l border-zinc-200 ml-1 space-y-0">
        {blocks.map((block) => {
          if (block.type === "place") {
            const place = places[block.placeIndex!];
            return (
              <li key={block.key} className="pl-4 pb-4 relative">
                <span className="absolute -left-[5px] top-0.5 h-2.5 w-2.5 rounded-full border-2 border-red-400 bg-white" />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                    {formatTime(block.start)}–{formatTime(block.end)}
                  </span>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {formatDuration(place.stayMinutes)}
                  </span>
                </div>
                <p className="text-sm font-medium text-zinc-800 mt-0.5 leading-snug">
                  {place.name}
                </p>
              </li>
            );
          }

          return (
            <TransitBlock key={block.key} fromId={block.fromId!} toId={block.toId!} />
          );
        })}

        {/* 종료 시각 */}
        <li className="pl-4 relative">
          <span className="absolute -left-[5px] top-0.5 h-2.5 w-2.5 rounded-full bg-zinc-300" />
          <span className="text-[11px] font-mono text-zinc-400">
            {formatTime(cursor)} 종료
          </span>
        </li>
      </ol>
    </div>
  );
}
