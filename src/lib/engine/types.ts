/**
 * 자체 경로탐색 엔진의 시간표 데이터 모델.
 *
 * GTFS를 RAPTOR 알고리즘이 바로 소비할 수 있는 평탄 배열로 재구성한 형태.
 * "raptor route"는 GTFS route와 다르다 — 같은 GTFS 노선이라도 정차 패턴(각역/급행 등)이
 * 다르면 별도의 raptor route로 분리된다 (RAPTOR의 전제: 한 route의 모든 trip은 동일한
 * 정차 순서를 가진다).
 *
 * 브라우저/서버 양쪽에서 로드되므로 이 모듈은 Node 전용 API를 쓰지 않는다.
 */

export interface ServiceCalendar {
  id: string;
  /** 운행 요일 비트마스크 — bit 0=월 … bit 6=일 */
  weekdays: number;
  /** YYYYMMDD 정수 */
  startDate: number;
  endDate: number;
  /** calendar_dates.txt exception_type=1 (추가 운행일) */
  addedDates: number[];
  /** calendar_dates.txt exception_type=2 (운휴일) */
  removedDates: number[];
}

export interface RouteMeta {
  id: string;
  agencyId: string;
  shortName: string;
  longName: string;
  /** GTFS route_type — 0 tram, 1 subway, 2 rail, 12 monorail 등 */
  type: number;
  /** "RRGGBB" (없으면 "") */
  color: string;
  textColor: string;
}

export interface Timetable {
  formatVersion: number;

  // ── 정류장 (stops.txt 전체 — location_type 0/1 모두 포함) ──
  stopIds: string[];
  /** 원본 표기 (일본어 + 로마자) */
  stopNames: string[];
  stopNamesKo: string[];
  stopNamesEn: string[];
  stopLats: Float64Array;
  stopLons: Float64Array;
  /** parent_station의 stop 인덱스, 없으면 -1 */
  stopParent: Int32Array;
  /** location_type 1(역 단위 그룹 노드) 여부 — 그룹 노드는 시간표에 등장하지 않는다 */
  stopIsStation: Uint8Array;

  // ── GTFS 노선 메타 (표시용) ──
  routes: RouteMeta[];

  // ── raptor routes ──
  /** raptor route r의 정차 stop 인덱스: routeStops[routeStopsIndex[r] .. routeStopsIndex[r+1]) */
  routeStopsIndex: Int32Array;
  routeStops: Int32Array;
  /** raptor route → routes(메타) 인덱스 */
  routeMetaIndex: Int32Array;
  /** raptor route r의 trip 범위: [routeTripsIndex[r], routeTripsIndex[r+1]) — trip은 첫 출발시각 오름차순 */
  routeTripsIndex: Int32Array;

  // ── trips (raptor route별로 연속 배치) ──
  tripIds: string[];
  tripServiceIndex: Int32Array;
  tripRouteIndex: Int32Array;
  /** headsign 문자열 풀 + trip별 인덱스 (중복 제거) */
  headsignPool: string[];
  tripHeadsignIndex: Int32Array;
  /**
   * trip t의 시각: stopTimes[tripTimesIndex[t] + 2*i] = i번째 정차역 도착초,
   * [.. + 2*i + 1] = 출발초. 자정 넘는 시각은 86400 이상 (예: 25:30 → 91800).
   */
  tripTimesIndex: Int32Array;
  stopTimes: Int32Array;
  /** 직통운전(in-seat transfer): 이 trip이 끝나면 이어지는 trip 인덱스, 없으면 -1 */
  tripContinuation: Int32Array;

  // ── stop → 그 정류장을 지나는 raptor route 목록 ──
  stopRoutesIndex: Int32Array;
  stopRoutes: Int32Array;

  // ── 도보 환승 (합성 footpath, 대칭) ──
  transfersIndex: Int32Array;
  transfersTo: Int32Array;
  transfersSecs: Int32Array;

  // ── 노선 선형 (shapes.txt, 표시 전용 — 단순화된 실선형) ──
  /** raptor route r의 선형 점 범위: shapeLats/Lons[routeShapeIndex[r] .. routeShapeIndex[r+1]) — 선형 없으면 빈 범위 */
  routeShapeIndex: Int32Array;
  /** f32 정밀도(~1m)면 표시용으로 충분 — f64 대비 절반 용량 */
  shapeLats: Float32Array;
  shapeLons: Float32Array;
  /** routeStops와 병렬: 해당 정차역의 선형 점 절대 인덱스 (선형 없으면 -1) */
  routeStopShapePos: Int32Array;

  services: ServiceCalendar[];
}
