import { Suspense } from "react";
import { PlacesProvider } from "@/lib/places-context";
import { RoutesProvider } from "@/lib/routes-context";
import WeatherWidget from "@/components/weather-widget";
import CurrencyWidget from "@/components/currency-widget";
import MapViewDynamic from "@/components/map-view-dynamic";
import Sidebar from "@/components/sidebar";

function WidgetSkeleton() {
  return <div className="rounded-xl bg-white/80 border border-zinc-100 px-4 py-3 text-xs text-zinc-400 w-48">불러오는 중...</div>;
}

export default function Home() {
  return (
    <RoutesProvider>
      <PlacesProvider>
        {/* 모바일: 지도 전체 화면 + 플래너 바텀시트 / 데스크톱: 좌측 사이드바 */}
        <div className="relative h-dvh overflow-hidden md:flex">
          {/* 모바일: 접힌 시트(h-40) 위까지만 지도 — 구글 로고·컨트롤이 가려지지 않게 */}
          <main className="absolute inset-x-0 top-0 bottom-40 md:static md:relative md:flex-1">
            <MapViewDynamic />
            {/* 지도 우측 상단 플로팅 위젯 — 모바일에서는 지도 공간 확보를 위해 숨김 */}
            <div className="absolute top-3 right-3 hidden md:flex flex-col gap-2 z-10 w-52 drop-shadow-md">
              <Suspense fallback={<WidgetSkeleton />}>
                <WeatherWidget />
              </Suspense>
              <Suspense fallback={<WidgetSkeleton />}>
                <CurrencyWidget />
              </Suspense>
            </div>
          </main>
          <Sidebar />
        </div>
      </PlacesProvider>
    </RoutesProvider>
  );
}
