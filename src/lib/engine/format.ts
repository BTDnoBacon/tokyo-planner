import type { Timetable } from "./types";

/**
 * Timetable 바이너리 컨테이너 포맷.
 *
 * 구조: [magic "TKRT"][u32 version][u32 jsonLen][JSON UTF-8][8바이트 정렬 패딩][blob들…]
 * - 문자열/객체 필드는 JSON부에, 대형 숫자 배열은 raw little-endian blob으로 뒤에 붙인다.
 * - JSON부의 typed array 필드 자리에는 blob 인덱스가 들어가고, sections 테이블이
 *   각 blob의 타입·오프셋·길이를 기록한다.
 * - Node와 브라우저 양쪽에서 동작 (DataView/TextEncoder만 사용).
 */

const MAGIC = 0x544b5254; // "TKRT"
export const FORMAT_VERSION = 1;

type BlobType = "i32" | "f64" | "u8";

interface Section {
  type: BlobType;
  byteOffset: number;
  length: number;
}

/** Timetable에서 blob으로 나가는 필드와 타입 (직렬화/역직렬화가 공유하는 단일 정의) */
const BLOB_FIELDS: { key: keyof Timetable; type: BlobType }[] = [
  { key: "stopLats", type: "f64" },
  { key: "stopLons", type: "f64" },
  { key: "stopIsStation", type: "u8" },
  { key: "stopParent", type: "i32" },
  { key: "routeStopsIndex", type: "i32" },
  { key: "routeStops", type: "i32" },
  { key: "routeMetaIndex", type: "i32" },
  { key: "routeTripsIndex", type: "i32" },
  { key: "tripServiceIndex", type: "i32" },
  { key: "tripRouteIndex", type: "i32" },
  { key: "tripHeadsignIndex", type: "i32" },
  { key: "tripTimesIndex", type: "i32" },
  { key: "stopTimes", type: "i32" },
  { key: "tripContinuation", type: "i32" },
  { key: "stopRoutesIndex", type: "i32" },
  { key: "stopRoutes", type: "i32" },
  { key: "transfersIndex", type: "i32" },
  { key: "transfersTo", type: "i32" },
  { key: "transfersSecs", type: "i32" },
];

const BYTES_PER_ELEMENT: Record<BlobType, number> = { i32: 4, f64: 8, u8: 1 };

function align8(n: number): number {
  return (n + 7) & ~7;
}

export function serializeTimetable(t: Timetable): Uint8Array {
  const json: Record<string, unknown> = {
    formatVersion: FORMAT_VERSION,
    stopIds: t.stopIds,
    stopNames: t.stopNames,
    stopNamesKo: t.stopNamesKo,
    stopNamesEn: t.stopNamesEn,
    routes: t.routes,
    tripIds: t.tripIds,
    headsignPool: t.headsignPool,
    services: t.services,
  };

  const sections: Section[] = [];
  const blobs: (Int32Array | Float64Array | Uint8Array)[] = [];
  // 헤더(12B) + JSON 길이를 알아야 오프셋이 정해지므로 2-pass: 먼저 상대 오프셋 0 기준으로 배치
  let blobCursor = 0;
  for (const { key, type } of BLOB_FIELDS) {
    const arr = t[key] as Int32Array | Float64Array | Uint8Array;
    blobCursor = align8(blobCursor);
    sections.push({ type, byteOffset: blobCursor, length: arr.length });
    blobs.push(arr);
    blobCursor += arr.length * BYTES_PER_ELEMENT[type];
  }
  json.sections = sections;

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const blobBase = align8(12 + jsonBytes.length);
  const total = blobBase + blobCursor;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, FORMAT_VERSION, true);
  view.setUint32(8, jsonBytes.length, true);
  out.set(jsonBytes, 12);
  sections.forEach((sec, i) => {
    const src = blobs[i];
    out.set(
      new Uint8Array(src.buffer, src.byteOffset, src.length * BYTES_PER_ELEMENT[sec.type]),
      blobBase + sec.byteOffset
    );
  });
  return out;
}

export function deserializeTimetable(data: Uint8Array | ArrayBuffer): Timetable {
  let bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // zero-copy typed array 뷰는 요소 크기 배수 오프셋을 요구 — Node Buffer는 pool 오프셋이
  // 8의 배수가 아닐 수 있으므로 그 경우에만 복사해서 정렬을 보장
  if (bytes.byteOffset % 8 !== 0) bytes = new Uint8Array(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("잘못된 timetable 파일 (magic 불일치)");
  const version = view.getUint32(4, true);
  if (version !== FORMAT_VERSION) throw new Error(`지원하지 않는 포맷 버전: ${version}`);

  const jsonLen = view.getUint32(8, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + jsonLen)));
  const blobBase = align8(12 + jsonLen);

  const t = {
    formatVersion: version,
    stopIds: json.stopIds,
    stopNames: json.stopNames,
    stopNamesKo: json.stopNamesKo,
    stopNamesEn: json.stopNamesEn,
    routes: json.routes,
    tripIds: json.tripIds,
    headsignPool: json.headsignPool,
    services: json.services,
  } as Timetable;

  const sections: Section[] = json.sections;
  BLOB_FIELDS.forEach(({ key, type }, i) => {
    const sec = sections[i];
    if (!sec || sec.type !== type) throw new Error(`섹션 불일치: ${String(key)}`);
    const byteOffset = bytes.byteOffset + blobBase + sec.byteOffset;
    // 원본 버퍼를 zero-copy로 참조 (역직렬화 비용 최소화)
    const arr =
      type === "f64"
        ? new Float64Array(bytes.buffer, byteOffset, sec.length)
        : type === "u8"
          ? new Uint8Array(bytes.buffer, byteOffset, sec.length)
          : new Int32Array(bytes.buffer, byteOffset, sec.length);
    (t as unknown as Record<string, unknown>)[key as string] = arr;
  });
  return t;
}
