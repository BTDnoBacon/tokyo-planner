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
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 relative">
            <MapViewDynamic />
            {/* 지도 우측 상단 플로팅 위젯 */}
            <div className="absolute top-3 right-3 flex flex-col gap-2 z-10 w-52 drop-shadow-md">
              <Suspense fallback={<WidgetSkeleton />}>
                <WeatherWidget />
              </Suspense>
              <Suspense fallback={<WidgetSkeleton />}>
                <CurrencyWidget />
              </Suspense>
            </div>
          </main>
        </div>
      </PlacesProvider>
    </RoutesProvider>
  );
}
