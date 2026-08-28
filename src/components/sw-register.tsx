"use client";

import { useEffect } from "react";

/** Service Worker 등록 + 엔진 시간표 선다운로드 (오프라인 대비 워밍업) */
export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록 실패는 앱 동작에 치명적이지 않음 (오프라인 기능만 비활성)
      });
    }
  }, []);

  return null;
}
