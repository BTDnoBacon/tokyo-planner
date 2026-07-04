"use client";

import { usePlaces } from "@/lib/places-context";

export default function DayTabs() {
  const { days, activeDayIndex, addDay, removeDay, setActiveDay } = usePlaces();

  function handleRemove(index: number, placeCount: number) {
    if (
      placeCount > 0 &&
      !window.confirm(`Day ${index + 1}의 장소 ${placeCount}곳이 함께 삭제됩니다. 계속할까요?`)
    ) {
      return;
    }
    removeDay(index);
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-zinc-100 shrink-0">
      {days.map((day, i) => {
        const isActive = i === activeDayIndex;
        const removable = isActive && days.length > 1;
        return (
          <div
            key={i}
            className={`flex shrink-0 items-center rounded-full text-xs transition-colors ${
              isActive
                ? "bg-red-500 text-white"
                : "bg-white border border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-500"
            }`}
          >
            <button
              onClick={() => setActiveDay(i)}
              className={`flex items-center gap-1 py-1 pl-2.5 ${removable ? "pr-1" : "pr-2.5"}`}
            >
              <span className="font-medium whitespace-nowrap">Day {i + 1}</span>
              {day.places.length > 0 && (
                <span className={`text-[10px] ${isActive ? "text-red-100" : "text-zinc-400"}`}>
                  {day.places.length}
                </span>
              )}
            </button>
            {removable && (
              <button
                onClick={() => handleRemove(i, day.places.length)}
                className="py-1 pl-0.5 pr-2 text-red-200 hover:text-white transition-colors leading-none"
                aria-label={`Day ${i + 1} 삭제`}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={addDay}
        className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:border-red-300 hover:text-red-500 transition-colors"
        aria-label="일차 추가"
      >
        +
      </button>
    </div>
  );
}
