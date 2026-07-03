"use client";

import { useState, useTransition } from "react";
import { usePlaces } from "@/lib/places-context";
import { fetchDirections } from "@/lib/actions/directions";
import type { TransportMode, TransitStep } from "@/lib/types";

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

const TRANSPORT_OPTIONS: {
  mode: TransportMode;
  icon: string;
  label: string;
  defaultMin: number;
  travelMode: "walking" | "transit" | "driving";
}[] = [
  { mode: "walk",    icon: "🚶", label: "도보", defaultMin: 15, travelMode: "walking" },
  { mode: "transit", icon: "🚃", label: "전철", defaultMin: 10, travelMode: "transit" },
  { mode: "taxi",    icon: "🚕", label: "택시", defaultMin: 10, travelMode: "driving" },
];

const START_HOUR_OPTIONS = [7, 8, 9, 10, 11] as const;

function TransitStepsList({ steps }: { steps: TransitStep[] }) {
  return (
    <div className="ml-1 mt-1 space-y-1 border-l-2 border-zinc-100 pl-3">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2">
          {step.type === "walk" ? (
            <>
              <span className="shrink-0 text-base leading-none mt-0.5">🚶</span>
              <span className="text-xs text-zinc-400">도보 {step.minutes}분</span>
            </>
          ) : (
            <>
              <span
                className="shrink-0 mt-1.5 w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: step.color ?? "#888" }}
              />
              <div className="text-xs text-zinc-600 leading-snug">
                <span className="font-medium">{step.lineName}</span>
                {step.fromStation && step.toStation && (
                  <span className="text-zinc-400"> · {step.fromStation} → {step.toStation}</span>
                )}
                <span className="text-zinc-400"> {step.minutes}분</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function TransitBlock({
  fromId,
  toId,
  departureHour,
}: {
  fromId: string;
  toId: string;
  departureHour: number;
}) {
  const { places, transits, transitSteps, updateTransit, setDirectionsResult, setTransitSteps } = usePlaces();
  const transit = transits.find((t) => t.fromId === fromId && t.toId === toId);
  const steps = transitSteps[`${fromId}-${toId}`] ?? null;
  const [isPending, startTransition] = useTransition();
  const [autoError, setAutoError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const currentMode: TransportMode = transit?.mode ?? "walk";
  const currentMin = transit?.minutes ?? 15;

  function handleModeClick(mode: TransportMode) {
    const defaultMin = TRANSPORT_OPTIONS.find((o) => o.mode === mode)!.defaultMin;
    updateTransit(fromId, toId, mode, transit?.minutes ?? defaultMin);
    setDirectionsResult(fromId, toId, null);
    setTransitSteps(fromId, toId, null);
    setAutoError(null);
    setShowSteps(false);
  }

  function handleMinChange(raw: string) {
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val > 0) updateTransit(fromId, toId, currentMode, val);
  }

  function handleAutoCalc() {
    const from = places.find((p) => p.id === fromId);
    const to = places.find((p) => p.id === toId);
    if (!from || !to) return;

    const travelMode = TRANSPORT_OPTIONS.find((o) => o.mode === currentMode)!.travelMode;

    setAutoError(null);
    setDirectionsResult(fromId, toId, null);
    setTransitSteps(fromId, toId, null);

    startTransition(async () => {
      const result = await fetchDirections(
        from.lat, from.lng, to.lat, to.lng,
        travelMode, departureHour
      );

      if (!result.ok) {
        setAutoError(result.error);
        return;
      }

      updateTransit(fromId, toId, currentMode, result.data.durationMinutes);

      if (result.data.steps && result.data.steps.length > 0) {
        setTransitSteps(fromId, toId, result.data.steps);
        setShowSteps(true);
      }

      // 도보는 구글 SDK로 경로 지도 표시
      if (currentMode === "walk") {
        const service = new google.maps.DirectionsService();
        service.route(
          {
            origin: { lat: from.lat, lng: from.lng },
            destination: { lat: to.lat, lng: to.lng },
            travelMode: google.maps.TravelMode.WALKING,
          },
          (sdkResult, status) => {
            if (status === google.maps.DirectionsStatus.OK && sdkResult) {
              setDirectionsResult(fromId, toId, sdkResult);
            }
          }
        );
      }
    });
  }

  const currentOption = TRANSPORT_OPTIONS.find((o) => o.mode === currentMode)!;

  return (
    <li className="pl-4 pb-3 relative">
      <span className="absolute -left-px top-0 bottom-0 border-l border-dashed border-zinc-300" />
      <div className="ml-1 space-y-1">
        <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 space-y-2">
          {/* 1행: 수단 선택 + 시간 입력 */}
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {TRANSPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => handleModeClick(opt.mode)}
                  className={`rounded px-2 py-0.5 text-sm transition-colors ${
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
            <span className="text-zinc-300 text-xs">·</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={300}
                value={currentMin}
                onChange={(e) => handleMinChange(e.target.value)}
                className="w-10 text-center text-xs border border-zinc-200 rounded px-1 py-0.5 outline-none focus:border-zinc-400 bg-white"
              />
              <span className="text-xs text-zinc-400">분</span>
            </div>
            <span className="text-xs text-zinc-500">{currentOption.icon} {currentOption.label}</span>
          </div>

          {/* 2행: 버튼들 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAutoCalc}
              disabled={isPending}
              className="text-xs px-2.5 py-0.5 rounded-full border border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-50"
            >
              {isPending ? "계산 중..." : "자동 계산"}
            </button>
            {steps && steps.length > 0 && (
              <button
                onClick={() => setShowSteps((v) => !v)}
                className="text-xs px-2.5 py-0.5 rounded-full border border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors"
              >
                {showSteps ? "접기" : "경로 보기"}
              </button>
            )}
          </div>
        </div>

        {autoError && (
          <p className="text-xs text-red-400 ml-1">{autoError}</p>
        )}

        {showSteps && steps && <TransitStepsList steps={steps} />}
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

  let cursor = startHour * 60;
  const blocks: {
    type: "place" | "transit";
    key: string;
    start: number;
    end: number;
    placeIndex?: number;
    fromId?: string;
    toId?: string;
  }[] = [];

  places.forEach((place, i) => {
    const start = cursor;
    const end = cursor + place.stayMinutes;
    blocks.push({ type: "place", key: place.id, start, end, placeIndex: i });
    cursor = end;

    if (i < places.length - 1) {
      const next = places[i + 1];
      const transit = transits.find((t) => t.fromId === place.id && t.toId === next.id);
      const tMin = transit?.minutes ?? 15;
      blocks.push({
        type: "transit",
        key: `${place.id}-${next.id}`,
        start: cursor,
        end: cursor + tMin,
        fromId: place.id,
        toId: next.id,
      });
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
            const totalMinutes = cursor - startHour * 60;
            const barWidth = totalMinutes > 0 ? Math.round((place.stayMinutes / totalMinutes) * 100) : 0;
            return (
              <li key={block.key} className="pl-4 pb-4 relative">
                <span className="absolute -left-1.25 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-red-400 bg-white" />
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
                {place.memo && (
                  <p className="text-xs text-zinc-400 mt-0.5 leading-snug break-words">
                    {place.memo}
                  </p>
                )}
                <div className="mt-1.5 h-1 w-full rounded-full bg-zinc-100">
                  <div
                    className="h-1 rounded-full bg-red-300 transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </li>
            );
          }

          return (
            <TransitBlock key={block.key} fromId={block.fromId!} toId={block.toId!} departureHour={startHour} />
          );
        })}

        <li className="pl-4 relative">
          <span className="absolute -left-1.25 top-0.5 h-2.5 w-2.5 rounded-full bg-zinc-300" />
          <span className="text-[11px] font-mono text-zinc-400">
            {formatTime(cursor)} 종료
          </span>
        </li>
      </ol>

      {/* 요약 */}
      {(() => {
        const totalMinutes = cursor - startHour * 60;
        const stayMinutes = places.reduce((s, p) => s + p.stayMinutes, 0);
        const transitMinutes = totalMinutes - stayMinutes;
        return (
          <div className="mt-3 rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2.5 flex gap-4 text-xs text-zinc-500">
            <div>
              <p className="text-zinc-400">총 시간</p>
              <p className="font-medium text-zinc-700 mt-0.5">{formatDuration(totalMinutes)}</p>
            </div>
            <div>
              <p className="text-zinc-400">체류</p>
              <p className="font-medium text-zinc-700 mt-0.5">{formatDuration(stayMinutes)}</p>
            </div>
            <div>
              <p className="text-zinc-400">이동</p>
              <p className="font-medium text-zinc-700 mt-0.5">{formatDuration(transitMinutes)}</p>
            </div>
            <div>
              <p className="text-zinc-400">장소</p>
              <p className="font-medium text-zinc-700 mt-0.5">{places.length}곳</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
