/**
 * Service Worker — 오프라인 PWA 지원.
 * - 정적 자산(/_next/static, /icons): cache-first (내용 해시/불변 자원)
 * - 페이지 내비게이션: network-first, 오프라인이면 캐시된 앱 셸(/)로 폴백
 * 시간표 데이터(/engine/)는 여기서 다루지 않는다 — 엔진 Web Worker가 자체
 * Cache Storage로 관리하며, SW가 cache-first로 가로채면 만료 갱신이 막힌다.
 */
const STATIC_CACHE = "tokyo-planner-static-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 옛 버전 정적 캐시 정리
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("tokyo-planner-static-") && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith("/engine/")) return; // 엔진 Worker가 자체 캐싱

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // 성공한 루트 응답만 앱 셸로 저장 — 404/500이 셸을 오염시키지 않게
          if (res.ok && url.pathname === "/") {
            const cache = await caches.open(STATIC_CACHE);
            cache.put("/", res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match("/");
          return cached ?? Response.error();
        }
      })()
    );
  }
});
