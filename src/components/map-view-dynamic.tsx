"use client";

import dynamic from "next/dynamic";

// Google Maps는 브라우저 전용 — SSR 비활성화는 클라이언트 컴포넌트에서만 가능
const MapView = dynamic(() => import("@/components/map-view"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-zinc-400 text-sm">
      지도 불러오는 중...
    </div>
  ),
});

export default function MapViewDynamic() {
  return <MapView />;
}
