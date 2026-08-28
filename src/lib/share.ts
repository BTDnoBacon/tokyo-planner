/**
 * 플랜 URL 공유 인코딩 — 서버 없이 링크만으로 일정 공유.
 *
 * 플랜을 콤팩트 스키마로 축약 → deflate 압축 → base64url → URL 해시(#plan=…).
 * 해시는 서버로 전송되지 않으므로 일정 내용이 서버 로그에 남지 않는다.
 * 장소 10곳 기준 URL 길이 ~800자 수준.
 */
import type { DayPlan, TransportMode } from "./types";

const HASH_PREFIX = "#plan=";
const MODES: TransportMode[] = ["walk", "transit", "taxi"];

export interface SharedPlan {
  days: DayPlan[];
  startHour: number;
  name?: string;
}

/** 콤팩트 스키마: 장소는 배열 튜플, transit은 장소 인덱스 참조 (UUID 제외) */
interface Wire {
  v: 1;
  h: number; // startHour
  n?: string;
  d: {
    p: [string, number, number, number, string?][]; // [name, lat, lng, stayMinutes, memo?]
    t: [number, number, number, number][]; // [fromIdx, toIdx, modeIdx, minutes]
  }[];
}

function toWire(plan: SharedPlan): Wire {
  return {
    v: 1,
    h: plan.startHour,
    ...(plan.name ? { n: plan.name } : {}),
    d: plan.days.map((day) => {
      const idxOf = new Map(day.places.map((p, i) => [p.id, i]));
      return {
        p: day.places.map((p) =>
          p.memo
            ? ([p.name, p.lat, p.lng, p.stayMinutes, p.memo] as [string, number, number, number, string])
            : ([p.name, p.lat, p.lng, p.stayMinutes] as [string, number, number, number])
        ),
        t: day.transits
          .filter((t) => idxOf.has(t.fromId) && idxOf.has(t.toId))
          .map(
            (t) =>
              [idxOf.get(t.fromId)!, idxOf.get(t.toId)!, Math.max(0, MODES.indexOf(t.mode)), t.minutes] as [
                number, number, number, number,
              ]
          ),
      };
    }),
  };
}

function fromWire(wire: Wire): SharedPlan {
  const days: DayPlan[] = wire.d.map((day) => {
    const ids = day.p.map(() => crypto.randomUUID());
    return {
      places: day.p.map(([name, lat, lng, stayMinutes, memo], i) => ({
        id: ids[i],
        name: String(name),
        lat: Number(lat),
        lng: Number(lng),
        stayMinutes: Number(stayMinutes) || 60,
        order: i + 1,
        ...(memo ? { memo: String(memo) } : {}),
      })),
      transits: day.t
        .filter(([f, t]) => ids[f] !== undefined && ids[t] !== undefined)
        .map(([f, t, m, min]) => ({
          fromId: ids[f],
          toId: ids[t],
          mode: MODES[m] ?? "transit",
          minutes: Number(min) || 10,
        })),
    };
  });
  return {
    days: days.length > 0 ? days : [{ places: [], transits: [] }],
    startHour: typeof wire.h === "number" ? Math.min(23, Math.max(0, wire.h)) : 9,
    name: wire.n,
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(
  bytes: Uint8Array,
  stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }
): Promise<Uint8Array> {
  const buf = await new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  ).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodePlanToHash(plan: SharedPlan): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toWire(plan)));
  if (typeof CompressionStream !== "undefined") {
    const compressed = await pipe(json, new CompressionStream("deflate-raw"));
    return `${HASH_PREFIX}${bytesToBase64Url(compressed)}`;
  }
  // 구형 브라우저 폴백 — 비압축 (u 마커)
  return `${HASH_PREFIX}u${bytesToBase64Url(json)}`;
}

/** 유효하지 않으면 null (예외를 던지지 않음) */
export async function decodePlanFromHash(hash: string): Promise<SharedPlan | null> {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    const payload = hash.slice(HASH_PREFIX.length);
    const json =
      payload.startsWith("u")
        ? base64UrlToBytes(payload.slice(1))
        : await pipe(base64UrlToBytes(payload), new DecompressionStream("deflate-raw"));
    const wire = JSON.parse(new TextDecoder().decode(json)) as Wire;
    if (wire.v !== 1 || !Array.isArray(wire.d)) return null;
    return fromWire(wire);
  } catch {
    return null;
  }
}
