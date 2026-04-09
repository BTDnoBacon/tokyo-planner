"use client";

import { useState } from "react";
import { usePlaces } from "@/lib/places-context";

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

// 시작 시간 옵션 (오전 7시 ~ 오전 11시)
const START_HOUR_OPTIONS = [7, 8, 9, 10, 11] as const;

export default function Timeline() {
  const { places } = usePlaces();
  const [startHour, setStartHour] = useState(9);

  if (places.length === 0) {
    return (
      <p className="text-sm text-zinc-400 py-4 text-center">
        장소를 추가하면 타임라인이 생성됩니다
      </p>
    );
  }

  // 시작 시각 (분 단위)
  let cursor = startHour * 60;

  const blocks = places.map((place) => {
    const start = cursor;
    const end = cursor + place.stayMinutes;
    cursor = end;
    return { place, start, end };
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

      {/* 타임라인 블록 */}
      <ol className="relative border-l border-zinc-200 ml-1 space-y-0">
        {blocks.map(({ place, start, end }) => (
          <li key={place.id} className="pl-4 pb-4 relative">
            {/* 타임라인 점 */}
            <span className="absolute -left-[5px] top-0.5 h-2.5 w-2.5 rounded-full border-2 border-red-400 bg-white" />

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                {formatTime(start)}–{formatTime(end)}
              </span>
              <span className="text-xs text-zinc-400 shrink-0">
                {formatDuration(place.stayMinutes)}
              </span>
            </div>
            <p className="text-sm font-medium text-zinc-800 mt-0.5 leading-snug">
              {place.name}
            </p>
          </li>
        ))}

        {/* 종료 시각 표시 */}
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
