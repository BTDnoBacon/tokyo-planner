/**
 * 브라우저 내 경로탐색 Web Worker.
 *
 * 시간표(gzip)를 fetch → Cache Storage에 저장 → DecompressionStream으로 해제 →
 * 메모리에 유지하고 transit 질의를 처리한다. 최초 1회만 다운로드(~2.4MB)하면
 * 이후·오프라인에서는 캐시로 동작한다. 데이터 만료 시 온라인이면 재다운로드.
 *
 * 응답 규약: 경로 결과는 { id, response }, 인프라 실패(다운로드·해제·역직렬화)는
 * { id, infra } — 후자는 클라이언트가 서버 폴백으로 전환한다.
 */
import { deserializeTimetable } from "./format";
import { planTransit, planTransitOptions } from "./plan";
import type { Timetable } from "./types";

const DATA_URL = "/engine/tokyo-rail.bin.gz";
const CACHE_NAME = "tokyo-planner-engine-v1";

let timetable: Timetable | null = null;
let loading: Promise<Timetable> | null = null;

function todayJst(): number {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return jst.getUTCFullYear() * 10000 + (jst.getUTCMonth() + 1) * 100 + jst.getUTCDate();
}

function isFresh(tt: Timetable): boolean {
  return Math.max(...tt.services.map((s) => s.endDate)) >= todayJst();
}

async function decompress(res: Response): Promise<Timetable> {
  const stream = res.body!.pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return deserializeTimetable(new Uint8Array(buf));
}

async function loadData(): Promise<Timetable> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(DATA_URL);
  if (cached) {
    const tt = await decompress(cached.clone());
    if (isFresh(tt)) return tt;
    // 만료 — 온라인이면 갱신, 오프라인이면 그래도 캐시 사용 (에러는 plan에서 안내)
    try {
      const fresh = await fetch(DATA_URL);
      if (fresh.ok) {
        await cache.put(DATA_URL, fresh.clone());
        return decompress(fresh);
      }
    } catch {
      /* 오프라인 — 캐시 유지 */
    }
    return tt;
  }
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`시간표 다운로드 실패 (${res.status})`);
  await cache.put(DATA_URL, res.clone());
  return decompress(res);
}

interface WorkerRequest {
  id: number;
  /** true면 데이터 로드만 수행 (오프라인 대비 선다운로드) */
  warmup?: boolean;
  /** true면 Pareto 대안 포함 전체 옵션 반환 */
  options?: boolean;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  departureHour?: number;
  travelDate?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, warmup, options, originLat, originLng, destLat, destLng, departureHour, travelDate } = e.data;

  try {
    if (!timetable) {
      loading ??= loadData();
      try {
        timetable = await loading;
      } catch (err) {
        loading = null; // 실패한 promise를 캐시하지 않음 — 다음 요청에서 재시도
        throw err;
      }
    }
  } catch (err) {
    self.postMessage({ id, infra: String(err) });
    return;
  }

  if (warmup) {
    self.postMessage({ id, response: { ok: true } });
    return;
  }

  try {
    const result = options
      ? planTransitOptions(
          timetable, originLat!, originLng!, destLat!, destLng!, departureHour!, travelDate
        )
      : planTransit(
          timetable, originLat!, originLng!, destLat!, destLng!, departureHour!, travelDate
        );
    self.postMessage({ id, response: result });
  } catch (err) {
    // 계산 자체의 예외도 인프라성 — 서버 폴백 대상
    self.postMessage({ id, infra: String(err) });
  }
};
