"use client";

import { useEffect } from "react";
import { warmupEngine } from "@/lib/client-transit";

/** Service Worker 등록 + 엔진 시간표 선다운로드 (오프라인 대비 워밍업) */
export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록 실패는 앱 동작에 치명적이지 않음 (오프라인 기능만 비활성)
      });
    }
    // 첫 방문에서 계산을 안 해봐도 오프라인 전환이 가능하도록 시간표를 미리 받아둔다
    warmupEngine();
  }, []);

  return null;
}
