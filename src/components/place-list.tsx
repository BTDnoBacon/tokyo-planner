"use client";

import { useState, useRef, useEffect } from "react";
import { usePlaces } from "@/lib/places-context";

const STAY_OPTIONS = [30, 60, 90, 120, 180, 240] as const;

function formatStay(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function PlaceNameEditor({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const { renamePlace } = usePlaces();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) renamePlace(id, trimmed);
    else setDraft(name); // 빈 값이면 원래 이름으로 복원
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(name); setEditing(false); }
        }}
        className="flex-1 text-sm font-medium leading-snug text-zinc-800 bg-white border border-zinc-300 rounded px-1.5 py-0.5 outline-none focus:border-red-400 min-w-0"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(name); setEditing(true); }}
      className="flex-1 text-sm font-medium leading-snug text-zinc-800 break-all text-left hover:text-red-500 transition-colors"
      title="클릭해서 이름 수정"
    >
      {name}
    </button>
  );
}

export default function PlaceList() {
  const { places, removePlace, updateStayMinutes } = usePlaces();

  if (places.length === 0) {
    return (
      <p className="text-sm text-zinc-400 py-6 text-center">
        지도에서 장소를 클릭해 추가하세요
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {places.map((place) => (
        <li
          key={place.id}
          className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5"
        >
          {/* 순서 + 이름(클릭 편집) + 삭제 */}
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {place.order}
            </span>
            <PlaceNameEditor id={place.id} name={place.name} />
            <button
              onClick={() => removePlace(place.id)}
              className="shrink-0 text-zinc-300 hover:text-red-400 transition-colors text-base leading-none"
              aria-label="장소 삭제"
            >
              ×
            </button>
          </div>

          {/* 체류 시간 선택 */}
          <div className="mt-2 flex flex-wrap gap-1">
            {STAY_OPTIONS.map((min) => (
              <button
                key={min}
                onClick={() => updateStayMinutes(place.id, min)}
                className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                  place.stayMinutes === min
                    ? "bg-red-500 text-white"
                    : "bg-white border border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-500"
                }`}
              >
                {formatStay(min)}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
