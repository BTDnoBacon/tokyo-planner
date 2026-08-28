/**
 * 브라우저 내 경로탐색 Web Worker.
 *
 * 시간표(gzip)를 fetch → Cache Storage에 저장 → DecompressionStream으로 해제 →
 * 메모리에 유지하고 transit 질의를 처리한다. 최초 1회만 다운로드(~2.4MB)하면
 * 이후·오프라인에서는 캐시로 동작한다. 데이터 만료 시 온라인이면 재다운로드.
 */
import { deserializeTimetable } from "./format";
import { planTransit } from "./plan";
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

interface TransitRequest {
  id: number;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  departureHour: number;
  travelDate?: string;
}

self.onmessage = async (e: MessageEvent<TransitRequest>) => {
  const { id, originLat, originLng, destLat, destLng, departureHour, travelDate } = e.data;
  try {
    if (!timetable) {
      loading ??= loadData();
      timetable = await loading;
    }
    const result = planTransit(
      timetable, originLat, originLng, destLat, destLng, departureHour, travelDate
    );
    self.postMessage({ id, response: result });
  } catch (err) {
    self.postMessage({ id, response: { ok: false, error: String(err) } });
  }
};
