# 자체 경로탐색 엔진 전환 계획

> 2026-08-28 조사 기준. NAVITIME API를 오픈데이터 기반 자체 경로탐색 엔진으로 교체하는 로드맵.
> 조사 범위: ODPT 라이선스·커버리지, 대안 데이터 소스, 라우팅 알고리즘·구현체.

## 0. 결론 요약

- **프로젝트 근거 (2026-08-28 확인)**: Google Directions/Routes API는 **일본 대중교통(transit) 경로를 제공하지 않는다** (available_travel_modes에 TRANSIT 없음 — 소비자용 구글맵 앱과 달리 API로는 불가). 개발자가 쓸 수 있는 일본 전철 경로 API는 NAVITIME·駅すぱあと 등 유료 상용뿐 → 자체 엔진의 실질 가치가 여기서 나온다. NAVITIME을 썼던 이유이자, 이 프로젝트가 대체하는 지점.
- **실현 가능하다.** 수도권 36개 철도 사업자를 통합한 GTFS(TokyoGTFS)가 존재하고, 브라우저에서 도시권 규모 RAPTOR 라우팅이 돌아간다는 것은 기존 구현체(minotor, 스위스 전국)로 실증돼 있다.
- **알고리즘은 RAPTOR.** 전처리 불필요, 자료구조 단순, "도착시각 × 환승횟수" Pareto 결과가 기본형에서 나옴. 확장으로 rRAPTOR(출발시간 범위 검색).
- **"자체 API 제공" 백업 플랜은 조건부로만 유효.** ODPT 기본 라이선스는 원데이터(및 복원 가능한 가공 데이터)의 재배포·재제공을 서면 승낙 없이 금지한다. **경로탐색 "결과"만 반환하는 API는 일반적으로 허용 해석**이지만, 시각표 데이터를 그대로 내보내는 API는 불가. 설계 단계부터 이 경계를 지킨다.
- **운임 계산은 스코프에서 제외하고 시작한다.** 일본 철도 운임의 오픈데이터는 존재하지 않는다 (JR은 규칙 기반 자체 계산 가능, 사철은 수작업 테이블 필요 — 후순위 확장).

## 1. 데이터 소스 결정

### 1차 소스: TokyoGTFS (`https://mkuran.pl/gtfs/tokyo/rail.zip`)
- 수도권 36개 철도 사업자 통합 GTFS. shapes(선형) 포함. API 키 불필요, 출력물 MIT.
- **직통운전(직결운행)을 `block_id`로 표현** — 라우터가 in-seat transfer를 지원해야 함. 도쿄 특화 핵심 요건.
- Transitous(공개 MOTIS 인스턴스)도 이 피드를 사용 중 → 검증 비교 기준으로 활용 가능.
- ⚠️ 리스크: 원천이 ODPT 데이터의 변환·재배포라 라이선스 회색지대 + 개인 메인테이너 의존.
  개인 프로젝트/포트폴리오 용도로는 낮은 리스크, 상용 전환 시 재검토 필요.

### 2차 소스: ODPT 직접 (developer.odpt.org)
- 상시 제공: 도쿄메트로(기본 라이선스), 도에이(CC BY 4.0), TWR·TX·요코하마지하철 등. 무료 등록, 승인 ~2영업일.
- **JR동일본 + 대형 사철 8사(도큐·오다큐·게이오·세이부·도부·게이큐·소테츠)는 "챌린지 2026 한정"** — 챌린지 응모 전제, **2027-03-14 이용 종료**, JR동일본은 경합 서비스 개발 금지 조항 있음.
- GTFS-RT(실시간 지연·열차 위치)는 이 경로로만 확보 가능 → 실시간 기능 단계에서 도입.

### 라이선스 경계 (자체 API 제공 시)
| 행위 | 가능 여부 |
|---|---|
| 내 앱 안에서 경로탐색 결과 표시 | ✅ 가능 (출처 표기 의무) |
| 경로탐색 결과만 반환하는 공개 API | ⚠️ 일반적으로 허용 해석 (원데이터 복원 불가) — 공식 해석 문서는 없음 |
| 시각표·역 데이터를 반환하는 공개 API | ❌ ODPT 서면 승낙 필요 (CC BY인 도에이분 제외) |

## 2. 아키텍처

```
[빌드 타임 - Node]                     [런타임]
GTFS zip ─→ 파싱·정규화 ─→ 바이너리    1단계: Next.js 서버(fetchDirections 교체)
            (평탄 배열,    직렬화 ─→   2단계: Web Worker + Cache Storage
             날짜별 필터)  (~수십MB)           (오프라인 PWA)
```

- minotor(github.com/aubryio/minotor)가 실증한 패턴. 직접 구현하되 minotor·planarnetwork/raptor 코드를 참조.
  (지름길이 필요하면 minotor 채택 후 도쿄 특화만 보강하는 선택지도 있음)
- 기존 UI·플래너 레이어는 그대로 유지. `fetchDirections`의 NAVITIME 분기만 자체 엔진으로 교체.
  `TransitStep` 타입(노선명·환승역·소요분·노선색)이 이미 있어 반환 형태가 자연스럽게 맞음.

### 외부 API 최종 분담 (2026-08-28 결정)
| 역할 | 담당 | 비고 |
|---|---|---|
| 전철 경로·시간 (transit) | **자체 엔진** | NAVITIME 완전 제거 |
| 지도 표시·역지오코딩 | Google Maps JS API | 유지 결정 — 지도는 구글이 최선 |
| 도보·택시 시간 | Google Routes API | 유지 (일본에서 WALK/DRIVE는 API 지원됨) |

## 3. 단계별 로드맵

### Phase 0 — 준비 (완료 2026-08-28)
- [x] TokyoGTFS rail.zip 다운로드 + 실측 → `data/gtfs/rail.zip` (gitignore됨)
  - **zip 21MB / 사업자 46 / 노선 165 / 정류장 2,896 / trip 91,707 / stop_times 1,208,008행**
  - `transfers.txt` 27,024행 — 단, 전량 **transfer_type 4 (trip 간 직통운전)**. 도보 환승이 아니라
    직통운전의 정본 데이터 (block_id보다 명시적). 도보 환승은 Phase 1에서 좌표 기반 합성
  - `shapes.txt` 476,682행 → Phase 3 지도 polyline에 활용
  - calendar 4행 + calendar_dates 51행 → 서비스 패턴 단순 (평일/주말 체계)
- [ ] ODPT 개발자 등록 — 사용자 직접 진행 필요 (무료, 승인 ~2영업일). TokyoGTFS 우선 전략이라 당장 필수 아님, 챌린지 2026 엔트리 결정(§5) 시점에 함께
- [x] draft 자동 저장 구현 — 새로고침 시 플랜 유실 수정 (storage.ts / places-context / routes-context, Playwright로 복원·저장 양방향 검증)

### Phase 1 — 데이터 파이프라인 (완료 2026-08-28)
- [x] GTFS 파싱 (`scripts/gtfs/csv.ts` — RFC4180, 따옴표/개행 지원, 121만 행 ~1초)
- [x] RAPTOR용 평탄 배열 재구성 (`scripts/gtfs/transform.ts`) — **raptor route 2,403개**
      (동일 정차 패턴 그룹핑), trip 91,707개, 직통운전 27,024쌍 100% 매핑
- [x] 서비스 캘린더 (`src/lib/engine/calendar.ts`) — 요일 비트마스크 + exception 날짜, 런타임 날짜 필터용
- [x] 바이너리 직렬화 (`src/lib/engine/format.ts`) — 자체 컨테이너(JSON 헤더 + raw typed array blob,
      zero-copy 역직렬화). **출력 14.8MB / gzip 2.3MB**, 역직렬화 4ms
- [x] 도보 환승 합성 — 반경 400m, 4.8km/h × 우회계수 1.3 + 버퍼 30s (하한 90s, 동일역 하한 120s)
      → 2,716개 (대칭). 대형역 수작업 오버라이드는 Phase 2에서
- [x] 한국어/영어 역명 병합 (translations.txt — ko/en 각 2,896역 전체)
- [x] 테스트 33개 (CSV 엣지케이스, 캘린더, 라운드트립, 그룹핑·직통·환승 합성)
- 실행: `pnpm data:build` → `data/engine/tokyo-rail.bin` (gitignore). 전체 파이프라인 1.5초

### Phase 2 — RAPTOR 코어 (코어 완료 2026-08-28)
- [x] 기본 RAPTOR (`src/lib/engine/raptor.ts`) — 최조 도착 + 환승 횟수 Pareto, 멀티 소스/타겟
      (도보 오프셋), 서비스 캘린더 날짜 필터, 타겟 프루닝, 경로 복원(leg 단위)
- [x] 직통운전 처리 — transfers.txt(transfer_type 4) 기반. route 스캔에서 종점 도달 시
      continuation trip으로 같은 라운드(탑승 카운트 불변) 전파, 체인(3사 직통) 지원.
      실데이터 확인: 도요코선→후쿠토신선 "(직통) 환승 0회" 정상 출력
- [x] 심야 시각(24h+) 지원 — 서비스일 기준 25:00 표기 그대로 탐색 (24:30 신주쿠→시부야 검증)
- [x] 테스트 16개 (TDD: 급행 선택, dep==ready 경계, 캘린더, 도보 환승·미달 배제, 직통 0환승,
      Pareto 2건 반환, maxTransfers, 심야) — 구현 전 작성, 첫 실행 전건 통과
- [x] 스모크 CLI (`scripts/gtfs/query.ts`) — 한국어 역명 검색, **쿼리 5~20ms / 로드 ~10ms**
      (신주쿠→시부야 4분 사이쿄선, 신주쿠→오테마치 미타선 환승 등 실제와 부합)
- [x] **검증 셋** (`scripts/gtfs/validate.ts`) — 대표 40개 구간을 Transitous(공개 MOTIS,
      같은 TokyoGTFS 사용)와 자동 대조. 방법론: 좌표 기반인 기준계와 조건을 맞추기 위해
      역 중심→플랫폼 도보를 출발 오프셋으로 부여 + 기준계 응답의 앞뒤 도보 leg 제거
      (승차~하차 시각 비교). 동명이역 방어(중앙값 2km 클러스터링) 포함.
      **결과 (2026-09-01 09:00 기준): 40개 중 34개 ±5분 이내 일치** (13개는 ±0분).
      오차 초과 6건 분석: 자체가 느린 1건(오미야→도쿄)은 기준계가 신칸센 포함 피드(jp-jr)를
      병용하기 때문(우리 피드는 신칸센 제외 — 원데이터 실측으로 확인). 자체가 빠른 5건은
      직행 구간 위주로 실제 시각표와 부합 — 기준계의 보수적 환승/접근 프로파일 차이로 판단
- [ ] 대형 환승역 도보시간 수작업 오버라이드 테이블 — 검증에서 명백히 과소한 환승시간이
      드러나지 않아 후순위 백로그로 이동 (앱 실사용 피드백 기반으로 채움)
- 참고: footpath 전이적 폐쇄 대신 "라운드당 도보 1회" 방식 채택 (동등 정확성, 원 논문 각주 방식)

### Phase 3 — 앱 통합 (완료 2026-08-28)
- [x] `fetchDirections` transit 분기를 자체 엔진으로 교체, **NAVITIME 완전 제거**
      (`src/lib/engine-server.ts` — 프로세스당 1회 로드 캐시, 좌표→반경 1km 플랫폼 매핑,
      Pareto 후보 중 "도착시각 + 환승당 3분 페널티" 최소 선택)
- [x] 결과 → `TransitStep[]` 매핑 (`src/lib/engine/geo.ts`) — 한국어 역명, 노선색(route_color),
      직통 구간 "(직통)" 표기, 접근/이탈 도보 포함. 이동시간 = 도보+승차 (첫차 대기 제외)
- [x] 지도 전철 폴리라인 — shapes 대신 **정차역 좌표 연결** (경유역 포함, 노선색 표시).
      shapes.txt 기반 실선형은 백로그 (bin +수 MB 트레이드오프)
- [x] Vercel 배포 대응 — `pnpm build`가 `prepare.ts` 선행 (데이터 없으면 zip 다운로드→추출→
      파이프라인 자동 실행), `outputFileTracingIncludes`로 서버리스 번들에 bin 포함
- [x] 검증: 테스트 58개 (geo 순수 함수 + 실데이터 통합) + 브라우저 E2E
      (신주쿠역→센소지: 주오쾌속→소부선→츠쿠바익스프레스 + 앞뒤 도보, 실제와 부합)

### Phase 4 — 오프라인 PWA (2~3주)
- [ ] 라우팅을 Web Worker로 이동, 바이너리 시간표를 Cache Storage에 저장
- [ ] Service Worker + 매니페스트 (여행지에서 데이터 없이 경로계산)
- [ ] rRAPTOR: 출발시간 범위 검색 ("9시~10시 사이 출발" 시나리오)

### Phase 5 — 선택 확장 (백로그)
- 운임: JR 규칙 기반 계산(참고: github.com/xkikeg/ares) + 사철 운임표 → 또는 駅すぱあと API 프리플랜
- 실시간 지연 반영: ODPT GTFS-RT
- 경로탐색 결과 API 공개 (라이선스 경계 §1 준수)
- 챌린지 2026 출품

## 4. 리스크

| 리스크 | 대응 |
|---|---|
| TokyoGTFS 재배포 중단/라이선스 문제 | ODPT 직접 파이프라인을 Phase 5에 예비 (변환 로직 자체 구현) |
| JR·사철 ODPT 데이터 2027-03-14 종료 | 챌린지 데이터에 의존하지 않는 TokyoGTFS 우선 전략 유지 |
| 정확성 검증 난이도 (직통운전·심야·캘린더 예외) | Phase 2 자동 대조 테스트를 처음부터 구축 |
| 성능 미달 | 도쿄 철도만은 RAPTOR 논문 벤치마크(런던 전체)보다 작음 — 리스크 낮음. 실측으로 확인 |

## 5. 열린 결정

1. **챌린지 2026 응모 여부** — 응모하면 JR동일본·대형 사철 공식 데이터 + GTFS-RT를 쓸 수 있고 출품 이력도 남음. 단 2027-03 이후 해당 데이터 제거 의무, JR 경합 금지 조항 확인 필요.
2. **직접 구현 vs minotor 채택** — 학습 가치는 직접 구현, 속도는 minotor. 권장: RAPTOR 코어는 직접 구현(이 프로젝트의 존재 이유), 전처리·직렬화는 minotor 패턴 차용.

## 참고 자료

- RAPTOR 논문: https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf
- 분야 서베이: https://arxiv.org/pdf/1504.05140
- TokyoGTFS: https://github.com/MKuranowski/TokyoGTFS
- minotor (TS/브라우저 RAPTOR): https://github.com/aubryio/minotor
- Transitous (검증 비교용): https://transitous.org
- ODPT 개발자: https://developer.odpt.org (기본 라이선스: /terms/data_basic_license.html)
- 챌린지 2026: https://challenge2026.odpt.org
