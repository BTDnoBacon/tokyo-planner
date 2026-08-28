/**
 * 전철 경로 계산의 클라이언트 진입점.
 *
 * Web Worker(브라우저 내 엔진)를 우선 사용 — 최초 1회 시간표 다운로드 후에는
 * 오프라인에서도 동작하고 서버 왕복도 없다. Worker 인프라 실패(데이터 404,
 * DecompressionStream 부재 등)·타임아웃 시 null을 반환하며, 호출부(timeline)가
 * 서버 액션으로 폴백한다. 경로 없음 같은 정상적 실패는 그대로 전달한다.
 */
import type { TransitRouteResponse } from "./engine/plan";

const WORKER_TIMEOUT_MS = 20000;

interface WorkerReply {
  id: number;
  response?: TransitRouteResponse;
  /** 인프라 실패 — 서버 폴백 신호 */
  infra?: string;
}

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, (r: TransitRouteResponse | null) => void>();

function getWorker(): Worker | null {
  if (workerBroken || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./engine/worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<WorkerReply>) => {
        const resolve = pending.get(e.data.id);
        pending.delete(e.data.id);
        if (!resolve) return;
        if (e.data.infra !== undefined) {
          console.warn("전철 엔진 로컬 계산 불가, 서버 폴백:", e.data.infra);
          resolve(null);
        } else {
          resolve(e.data.response ?? null);
        }
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

function post(payload: Record<string, unknown>): Promise<TransitRouteResponse | null> {
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
    w.postMessage({ id, ...payload });
  });
}

/** 브라우저 엔진으로 계산 — 인프라 실패 시 null (호출부에서 서버 폴백) */
export function computeTransitLocal(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureHour: number,
  travelDate?: string
): Promise<TransitRouteResponse | null> {
  return post({ originLat, originLng, destLat, destLng, departureHour, travelDate });
}

/** 시간표 선다운로드 — 앱 진입 시 호출해 오프라인 대비 (fire-and-forget) */
export function warmupEngine(): void {
  void post({ warmup: true });
}
