import { Suspense } from "react";
import dynamic from "next/dynamic";
import { PlacesProvider } from "@/lib/places-context";
import PlaceList from "@/components/place-list";
import Timeline from "@/components/timeline";
import WeatherWidget from "@/components/weather-widget";
import CurrencyWidget from "@/components/currency-widget";

// Google Maps는 브라우저 전용 — SSR 비활성화
const MapView = dynamic(() => import("@/components/map-view"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-zinc-400 text-sm">
      지도 불러오는 중...
    </div>
  ),
});

export default function Home() {
  return (
    <PlacesProvider>
      <div className="flex h-full">
        {/* 사이드바 */}
        <aside className="w-80 shrink-0 flex flex-col border-r border-zinc-200 bg-white overflow-y-auto">
          {/* 헤더 */}
          <div className="px-5 py-4 border-b border-zinc-100">
            <h1 className="text-lg font-semibold tracking-tight">🗼 Tokyo Planner</h1>
            <p className="text-xs text-zinc-400 mt-0.5">지도에 장소를 추가해 일정을 만들어보세요</p>
          </div>

          {/* 날씨 + 환율 위젯 영역 */}
          <div className="px-4 py-3 space-y-2 border-b border-zinc-100">
            <Suspense
              fallback={
                <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-xs text-zinc-400">
                  날씨 불러오는 중...
                </div>
              }
            >
              <WeatherWidget />
            </Suspense>
            <Suspense
              fallback={
                <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-xs text-zinc-400">
                  환율 불러오는 중...
                </div>
              }
            >
              <CurrencyWidget />
            </Suspense>
          </div>

          {/* 장소 목록 */}
          <div className="flex-1 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">장소 목록</span>
            </div>
            <PlaceList />
          </div>

          {/* 타임라인 */}
          <div className="px-4 py-3 border-t border-zinc-100">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">타임라인</span>
            <Timeline />
          </div>
        </aside>

        {/* 지도 영역 */}
        <main className="flex-1 relative">
          <MapView />
        </main>
      </div>
    </PlacesProvider>
  );
}
