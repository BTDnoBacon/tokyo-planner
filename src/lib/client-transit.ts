/**
 * 전철 경로 계산의 클라이언트 진입점.
 *
 * Web Worker(브라우저 내 엔진)를 우선 사용 — 최초 1회 시간표 다운로드 후에는
 * 오프라인에서도 동작하고 서버 왕복도 없다. Worker 실패/타임아웃 시 null을
 * 반환하며, 호출부(timeline)가 서버 액션으로 폴백한다.
 */
import type { TransitRouteResponse } from "./engine/plan";

const WORKER_TIMEOUT_MS = 20000;

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, (r: TransitRouteResponse | null) => void>();

function getWorker(): Worker | null {
  if (workerBroken || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./engine/worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<{ id: number; response: TransitRouteResponse }>) => {
        pending.get(e.data.id)?.(e.data.response);
        pending.delete(e.data.id);
      };
      worker.onerror = () => {
        // 번들/로드 실패 — 이후 요청은 전부 서버 폴백
        workerBroken = true;
        pending.forEach((resolve) => resolve(null));
        pending.clear();
        worker?.terminate();
        worker = null;
      };
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}

/** 브라우저 엔진으로 계산 — 실패 시 null (호출부에서 서버 폴백) */
export function computeTransitLocal(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number,
  travelDate?: string
): Promise<TransitRouteResponse | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, WORKER_TIMEOUT_MS);
    pending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    w.postMessage({ id, originLat, originLng, destLat, destLng, departureHour, travelDate });
  });
}
