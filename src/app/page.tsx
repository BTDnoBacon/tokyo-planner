import { Suspense } from "react";
import { PlacesProvider } from "@/lib/places-context";
import { RoutesProvider } from "@/lib/routes-context";
import PlaceList from "@/components/place-list";
import Timeline from "@/components/timeline";
import WeatherWidget from "@/components/weather-widget";
import CurrencyWidget from "@/components/currency-widget";
import MapViewDynamic from "@/components/map-view-dynamic";
import RoutePanel from "@/components/route-panel";
import SidebarHeader from "@/components/sidebar-header";

export default function Home() {
  return (
    <RoutesProvider>
      <PlacesProvider>
        <div className="flex h-full">
          {/* 사이드바 */}
          <aside className="w-80 shrink-0 flex flex-col border-r border-zinc-200 bg-white overflow-y-auto">
            {/* 헤더 */}
            <SidebarHeader />

            {/* 날씨 + 환율 위젯 */}
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

            {/* 저장된 루트 */}
            <RoutePanel />

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
            <MapViewDynamic />
          </main>
        </div>
      </PlacesProvider>
    </RoutesProvider>
  );
}
