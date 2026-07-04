"use client";

import { useState, useRef, useEffect } from "react";
import { usePlaces } from "@/lib/places-context";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const STAY_OPTIONS = [30, 60, 90, 120, 180, 240] as const;

function formatStay(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function PlaceNameEditor({ id, name }: { id: string; name: string }) {
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
    else setDraft(name);
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

function PlaceMemoEditor({ id, memo }: { id: string; memo?: string }) {
  const { updateMemo } = usePlaces();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memo ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    updateMemo(id, draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={100}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(memo ?? ""); setEditing(false); }
        }}
        placeholder="메모 입력 (최대 100자)"
        className="mt-1.5 w-full text-xs text-zinc-600 bg-white border border-zinc-300 rounded px-1.5 py-0.5 outline-none focus:border-red-400"
      />
    );
  }

  if (!memo) {
    return (
      <button
        onClick={() => { setDraft(""); setEditing(true); }}
        className="mt-1.5 text-xs text-zinc-400 hover:text-red-500 transition-colors"
      >
        + 메모 추가
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex items-start gap-1">
      <button
        onClick={() => { setDraft(memo); setEditing(true); }}
        className="flex-1 min-w-0 text-left text-xs text-zinc-500 break-all hover:text-red-500 transition-colors"
        title="클릭해서 메모 수정"
      >
        {memo}
      </button>
      <button
        onClick={() => updateMemo(id, "")}
        className="shrink-0 text-zinc-300 hover:text-red-400 transition-colors text-sm leading-none"
        aria-label="메모 삭제"
      >
        ×
      </button>
    </div>
  );
}

function MoveDaySelect({ placeId }: { placeId: string }) {
  const { days, activeDayIndex, movePlaceToDay } = usePlaces();

  // 일차가 1개면 이동 UI 미노출
  if (days.length < 2) return null;

  return (
    <select
      value=""
      onChange={(e) => {
        const idx = Number(e.target.value);
        if (!Number.isNaN(idx)) movePlaceToDay(placeId, idx);
      }}
      aria-label="다른 일차로 이동"
      className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500 hover:border-red-300 hover:text-red-500 transition-colors cursor-pointer outline-none focus:border-red-400"
    >
      <option value="" disabled>
        Day 이동
      </option>
      {days.map((_, i) =>
        i === activeDayIndex ? null : (
          <option key={i} value={i}>
            Day {i + 1}으로
          </option>
        )
      )}
    </select>
  );
}

function SortablePlaceItem({ place }: { place: { id: string; name: string; order: number; stayMinutes: number; memo?: string } }) {
  const { removePlace, updateStayMinutes } = usePlaces();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: place.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex items-start gap-2">
        {/* 드래그 핸들 */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing touch-none"
          aria-label="드래그해서 순서 변경"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <circle cx="4" cy="3" r="1.2" />
            <circle cx="10" cy="3" r="1.2" />
            <circle cx="4" cy="7" r="1.2" />
            <circle cx="10" cy="7" r="1.2" />
            <circle cx="4" cy="11" r="1.2" />
            <circle cx="10" cy="11" r="1.2" />
          </svg>
        </button>
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
        <MoveDaySelect placeId={place.id} />
      </div>

      <PlaceMemoEditor id={place.id} memo={place.memo} />
    </li>
  );
}

export default function PlaceList() {
  const { places, reorderPlaces } = usePlaces();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = places.findIndex((p) => p.id === active.id);
    const toIndex = places.findIndex((p) => p.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) reorderPlaces(fromIndex, toIndex);
  }

  if (places.length === 0) {
    return (
      <p className="text-sm text-zinc-400 py-6 text-center">
        지도에서 장소를 클릭해 추가하세요
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={places.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {places.map((place) => (
            <SortablePlaceItem key={place.id} place={place} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
