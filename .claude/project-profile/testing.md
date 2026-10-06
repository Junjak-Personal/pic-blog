# Testing

## Frameworks
| Type | Framework | Config | Location |
|------|-----------|--------|----------|
| Unit | Vitest 5 | `vitest.config.ts` (include `shared/**/*.test.ts`) | `shared/utils/algorithms.test.ts` |
| 타입 | vue-tsc (`nuxt typecheck`) | `.nuxt/tsconfig.*.json` | — |
| E2E | Playwright 1.63 (`@playwright/test`) | `playwright.config.ts` | `tests/e2e/` |
| UI 점검 (사람/에이전트) | 브리프 | `_docs/reference/e2e-testing/2026-08-26-e2e-testing-brief.md` | — |
| 배포 후 스모크 | Aside `repl` | `scripts/smoke.js` | 🔴 운영 URL 고정 — 사람이 실행 |
| iOS 껍데기 | 없음 (`app-ios/test/` 비어 있음) | — | — |

## Test Commands
- All (CI 와 같은 순서): `pnpm typecheck && pnpm test && pnpm build`
- Unit: `pnpm test`
- E2E: `pnpm test:e2e` — webServer 가 `pnpm build` → `node tests/e2e/seed.ts` → `node .output/server/index.mjs` (포트 **4610**) 를 스스로 돈다. CI 에는 없다
- Coverage: 없음

## Patterns
- Unit: `describe`/`it` 안에서 `node:assert/strict` 를 쓴다 (옛 `__checks.ts` 를 그대로 옮긴 형태). 목업(`_workspace/deisgn/data.js`)과 대조해 만든 회귀 검사라 여기가 깨지면 포인트가 «조용히» 다르게 묶인다
- E2E 파일명: 비로그인 `*.noauth.spec.ts`, 로그인 `*.spec.ts` (전역 규칙). 로케이터는 `getByRole` → `getByText` 순
- E2E 응답 타입은 `shared/types/db.ts` 를 import 해 쓴다 — 손으로 다시 정의하지 않는다
- Test data: `tests/e2e/seed-data.ts` (시드 상수 — 부수 효과 없음, spec 이 import) · `tests/e2e/seed.ts` (DB 생성). 스키마는 `server/utils/db.ts` 의 `SCHEMA` 를 그대로 쓴다

## Coverage
- Target: 없음

## E2E Fixtures (REQUIRED before any automated E2E run)
- E2E account: 사용자 계정 개념이 없다 — 편집 비밀번호 1개.
  - agent-browser: 로컬 전용 Auth Vault 프로필 **`picblog-local`** (`http://localhost:4600/editor`). `picblog` 프로필은 **운영** URL 이라 자동화에 쓰지 않는다
  - Playwright: **E2E 전용 가짜 비밀번호** `EDITOR_PASSWORD` 와 그 해시가 `tests/e2e/seed-data.ts` 에 있고, `playwright.config.ts` 가 해시를 E2E 서버(4610)에만 넣는다. 🔴 저장소가 PUBLIC 이라 실제 비밀번호는 절대 적지 않는다 (`.env*` 에는 해시만 있어 평문을 되돌릴 수도 없다)
- Credentials source: 볼트 프로필 이름만 참조한다. 서버 쪽은 `.env.local` 의 `NUXT_ADMIN_PASSWORD_HASH` (gitignored, 값은 읽지 않는다)
- Test-data seed:
  - Playwright: `NUXT_DATA_DIR=<dir> node tests/e2e/seed.ts` — 공개 1 · 비공개 1 · 편집 spec 전용 비공개 1 (spec 끼리 서로의 기록을 바꾸지 않게). 🔴 대상 디렉토리를 비우고 다시 만든다. 저장소 `data/` 를 가리키면 거부한다
  - 에이전트 수동 QA: `data/` 를 격리 복사해 쓴다
    ```bash
    cp -Rp data/. <scratch>/qa-data/
    NUXT_DATA_DIR=<scratch>/qa-data pnpm dev      # process.env 가 .env.local 보다 우선 (c12)
    ```
- Fixture files: `tests/fixtures/photos/` — 업로드용 GPS EXIF 합성 JPEG 4장(두 지점) + GPS 없는 1장. 반경 50m 에서 포인트 2개 + 「위치 정보 없음」 1장 제외가 나온다 (2026-09-28 실제 업로드로 확인). 다시 만들기: `tests/fixtures/photos/make.sh` (macOS · exiftool). E2E 시드도 `a1-dongpirang.jpg` 를 사진 파일로 쓴다
- Target env: 로컬만. 개발 `http://localhost:4600` (Mapbox 토큰 URL 제한 · 볼트 프로필이 4600 에 묶임), Playwright `http://localhost:4610` (지도 타일은 뜨지 않는다). prd = `https://pic-blog.jun-devlog.win`, 사람만 실행
- Shared-resource caution: `data/` 는 개발자의 실제 로컬 기록이고 `pnpm dev` 가 기본으로 쓴다. 🔴 QA 쓰기는 반드시 격리 디렉토리에서 한다. 4600 이 이미 떠 있으면 누가 띄웠는지 먼저 확인한다
- 🔴 **dev 모드 로그인 경쟁**: `pnpm dev` 에서는 `auth login` 이 하이드레이션 전에 제출해 네이티브 `POST /editor` 로 끝나고 로그인이 안 된다 (`/api/auth/login` 요청 없음, 게이트 그대로 — 2026-09-28 재현). 로그인이 필요한 에이전트 QA 는 **프로덕션 빌드**로 띄운다:
  ```bash
  pnpm build
  PORT=4600 HOST=localhost NUXT_DATA_DIR=<scratch>/qa-data node --env-file=.env.local .output/server/index.mjs
  ```
  로그인 판정은 「✓ Logged in」 출력이 아니라 로그인 후에만 있는 요소(「새 기록」 링크 · 비공개 행)와 `POST /api/auth/login 200` 으로 한다. 게이트와 목록이 같은 URL(`/editor`)이라 URL 로는 판정할 수 없다
- 🔴 **헤드리스 사진 선택**: 「사진 선택」은 숨은 `input[type=file]` 을 `click()` 하는데, 헤드리스에서는 파일 창이 없어 곧바로 `cancel` 로 끝난다. agent-browser 로는 먼저 `HTMLInputElement.prototype.click` 을 파일 input 에 한해 무력화(eval)한 뒤 버튼을 누르고 `upload 'input[type=file]' <files>` 로 넣는다. Playwright 로는 `page.waitForEvent('filechooser')` 가 표준 방법이다 (이 프로젝트에서는 미검증 — 업로드 spec 을 쓸 때 확인)
- Teardown: Playwright 는 매 실행마다 `_workspace/e2e/playwright/data` 를 새로 만든다. 수동 QA 는 격리 복사본 삭제 + 띄운 서버 종료
- Device targets: iOS 껍데기 — 실기기 (`app-ios/tool/dev-install.sh`, 맥의 dev 서버를 `.local` 이름으로 바라봄). 시뮬레이터 절차는 문서화되어 있지 않다 `[FILL]`
- Launch command: `pnpm dev --host 0.0.0.0` → `app-ios/tool/dev-install.sh` · version pin: 없음 (fvm 설정 없음)
- Host-OS gate: iOS = macOS only. 이 저장소에 Android 타깃은 없다

## Agentic Testing Adapter
- Surface: web
- Driver: agent-browser (CLI 0.31.1 + skill 확인)
- Emitter house-style: `reference/e2e-testing.md` (Playwright `.spec.ts`) — `tests/e2e/*.noauth.spec.ts` 가 기준 예시
- Concurrency: serial-shared-browser (`workers: 1`, 서버 하나 · DB 하나)
- Generated spec dir: `tests/e2e/`
