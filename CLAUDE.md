# Tokyo Planner

도쿄 여행 동선 플래너 (Next.js 16 / React 19 / Tailwind 4). 지도에 장소를 찍어 일차별 동선을
짜고, 이동 시간을 계산해 타임라인으로 보여준다.

**전철 경로는 자체 RAPTOR 엔진** (오픈데이터 TokyoGTFS 기반, NAVITIME 제거됨) —
`src/lib/engine/` + 서버 진입점 `src/lib/engine-server.ts`. 도보/택시는 Google Routes API,
지도 표시는 Google Maps. 로드맵·데이터 소스·라이선스 제약은 `docs/routing-engine-plan.md`가 정본.

## 명령어

```bash
pnpm dev          # 개발 서버 (전철 계산엔 data/engine/tokyo-rail.bin 필요 — 없으면 data:build)
pnpm build        # 프로덕션 빌드 — prepare.ts가 시간표 데이터 없으면 자동 다운로드·생성 (Vercel 대응)
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (실데이터 통합 테스트는 bin 있을 때만 실행)
pnpm data:build   # GTFS → data/engine/tokyo-rail.bin 빌드 (입력: data/gtfs/extracted/)
tsx scripts/gtfs/query.ts 신주쿠 시부야 09:00      # 경로 스모크 CLI
tsx scripts/gtfs/validate.ts 09:00 20260901        # Transitous 대조 검증 (네트워크 필요)
```

## 환경 주의사항

- **pnpm 버전**: `package.json`의 `packageManager` 필드(pnpm 10)가 정본 — corepack이 있으면
  자동 적용되고, 없으면 `npx pnpm@10 …`으로 실행. lockfile은 v9 형식.
- 네이티브 빌드 스크립트는 `pnpm.onlyBuiltDependencies`(esbuild, sharp, unrs-resolver)로
  승인됨 — 새 의존성이 "Ignored build scripts" 경고를 내면 이 목록에 추가.
- pnpm이 PATH에 없는 환경에서는 `./node_modules/.bin/`의 바이너리(tsc, eslint, vitest,
  next, tsx)를 직접 실행하면 된다.
- API 키는 `.env.local` (`.env.example` 참고). 키가 없어도 앱은 뜨고 지도·위젯만 에러 표시.
- **Service Worker는 프로덕션 전용** — dev 청크는 이름에 해시가 없어 SW의 cache-first가
  낡은 번들을 서빙한다 (수정이 반영 안 되는 것처럼 보임). sw-register가 dev에서는 등록을
  건너뛰고 기존 등록을 해제하지만, 오염된 브라우저 프로필은 DevTools에서 SW 수동 해제 필요.

## 데이터

- `data/gtfs/rail.zip` — TokyoGTFS 원본 (gitignore). 없으면:
  `curl -L -o data/gtfs/rail.zip https://mkuran.pl/gtfs/tokyo/rail.zip`
- `data/gtfs/extracted/` — 압축 해제본. `data:build`의 입력.
- `data/engine/tokyo-rail.bin` — 빌드 산출물 (gitignore, `pnpm data:build`로 재생성).
- GTFS 특이사항: `transfers.txt`는 도보 환승이 아니라 **trip 간 직통운전(transfer_type 4)**.
  도보 환승은 transform에서 좌표 기반 합성. 심야 시각은 24시 이상 표기(25:30 → 91800초).

## 코드 규칙

- 주석·커밋 메시지·UI 문자열은 한국어 (기존 스타일 유지).
- `src/lib/engine/`은 **브라우저 안전** — Node 전용 API(fs, path 등) import 금지.
  Node 전용 빌드 코드는 `scripts/`에 둔다.
- 상태 관리는 React Context (`places-context` = 편집 중 플랜, `routes-context` = 저장된 루트).
  localStorage 접근은 `src/lib/storage.ts`로 모은다.
- 엔진 코어 로직(파서·변환·알고리즘)은 vitest 테스트 필수. RAPTOR 코어는 TDD로 진행.

## Git 워크플로우

- feature 브랜치 → PR → main. main은 Vercel 프로덕션에 바로 배포되므로 미완성 기능을
  머지하지 않는다 (엔진 작업은 Phase 3 앱 통합 완료 시점에 머지).
- 작업 단위 완료 시 바로 push해도 됨 (사용자 승인 완료된 지침).
- 라이선스 주의: GTFS 시각표 **원데이터를 재배포하는 API·엔드포인트를 만들지 말 것**
  (ODPT 라이선스 — 경로탐색 "결과" 반환만 허용). 상세는 로드맵 문서 §1.
