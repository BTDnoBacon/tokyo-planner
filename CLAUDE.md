# Tokyo Planner

도쿄 여행 동선 플래너 (Next.js 16 / React 19 / Tailwind 4). 지도에 장소를 찍어 일차별 동선을
짜고, 이동 시간을 계산해 타임라인으로 보여준다.

**현재 방향**: NAVITIME API를 오픈데이터(TokyoGTFS) 기반 자체 RAPTOR 경로탐색 엔진으로
교체하는 중. 로드맵·데이터 소스·라이선스 제약은 `docs/routing-engine-plan.md`가 정본.

## 명령어

```bash
pnpm dev          # 개발 서버
pnpm build        # 프로덕션 빌드
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm data:build   # GTFS → data/engine/tokyo-rail.bin 빌드 (사전: extracted/ 필요, 아래 참고)
```

## 환경 주의사항

- **pnpm 버전**: lockfile이 v6 형식(pnpm 8). 의존성 추가·설치는 `npx pnpm@8 …`로 할 것.
  pnpm 10을 쓰면 lockfile을 v9로 다시 쓰고 `pnpm-workspace.yaml`을 만들어버린다 — 금지.
- pnpm이 PATH에 없는 환경에서는 `./node_modules/.bin/`의 바이너리(tsc, eslint, vitest,
  next, tsx)를 직접 실행하면 된다.
- API 키는 `.env.local` (`.env.example` 참고). 키가 없어도 앱은 뜨고 지도·위젯만 에러 표시.

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
