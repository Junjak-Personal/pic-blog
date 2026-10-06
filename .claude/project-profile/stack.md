# Tech Stack

## Runtime
- Language: TypeScript (strict, `nuxt.config.ts` → `typescript.strict: true`)
- Runtime: **Node 24** — 로컬(mise) · CI(`actions/setup-node` 24) · Docker(`node:24-slim`) 모두 같다 (2026-09-28 에 22 → 24 로 통일)
- Package manager: **pnpm 11.28.0** — `pnpm-lock.yaml` (lockfileVersion 9.0), `pnpm-workspace.yaml` 의 `allowBuilds`(better-sqlite3 · esbuild · vue-demi)
- Detection: `package.json` 의 `packageManager: "pnpm@11.28.0"` 이 유일한 출처다. 로컬 corepack · CI(`pnpm/action-setup`, version 입력 없음) · Dockerfile(`npm i -g "$(node -p … packageManager)"`) 이 모두 이 값을 읽는다. 올릴 때는 이 필드 하나만 바꾼다

## Framework
- Framework: Nuxt 4.5 (Nitro 2.13, Vite 8) · Vue 3.5 · srcDir `app/`, 공용 `shared/`, 서버 `server/`
- UI library: `reka-ui` (headless, `reka-ui/nuxt` 모듈) — 인터랙티브 프리미티브는 반드시 이것 (AGENTS.md)
- CSS: Tailwind 없음. `app/assets/css/*.css` 의 CSS 변수 + SFC `<style scoped>` 만
- 지도: mapbox-gl v3 (커스텀 Studio 스타일)
- DB: SQLite 파일 하나 · better-sqlite3 (네이티브 애드온, Nitro external) · WAL
- 인증: nuxt-auth-utils (비밀번호 1개 · scrypt 해시 · 봉인 세션 쿠키)
- iOS 껍데기: `app-ios/` — Flutter (Dart SDK ^3.13) + WKWebView. 웹과 별개 빌드

## Key Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| nuxt | ^4.5.2 | 프레임워크 |
| vue / vue-router | ^3.5.41 / ^5.2.0 | 예전엔 `latest` 였다 — 설치 시점에 메이저가 바뀔 수 있어 caret 로 고정 |
| reka-ui | ^2.10.3 | headless 컴포넌트 (dialog, popover, select, alert-dialog …) |
| mapbox-gl | ^3.29.0 | 지도 · 마커 · 동선 |
| better-sqlite3 | ^13.0.3 | SQLite |
| nuxt-auth-utils | ^0.5.30 | 세션 · scrypt |
| exifr | ^7.1.3 | 브라우저에서 EXIF(GPS·시각) 추출 |
| swiper | ^14.1.0 | 라이트박스 캐러셀 |
| @internationalized/date | ^3.12.3 | 기간 선택(reka DatePicker) |
| @adonisjs/hash (dev) | 9.1.1 | `scripts/hash-password.mjs` |
| typescript / vue-tsc (dev) | ^5.9.2 / ^3.1.1 | 타입 검사 |
| vitest (dev) | ^5.0.2 | 단위 테스트 (`shared/**/*.test.ts`) |
| @playwright/test (dev) | ^1.63.0 | E2E (`tests/e2e`) |

## Build (pnpm)
- Dev: `pnpm dev` → `nuxt dev --dotenv .env.local`, **http://localhost:4600** 고정 (Mapbox 토큰 URL 제한 때문에 `127.0.0.1` 금지)
- Build: `pnpm build` → `.output/`
- Prod 로컬 실행: `PORT=4600 HOST=localhost node --env-file=.env.local .output/server/index.mjs`
- Test: `pnpm test` (Vitest) · E2E `pnpm test:e2e` (Playwright — 빌드 + 시드 + 4610 기동까지 스스로 한다)
- Install: `pnpm install` (postinstall 이 `nuxt prepare`)
- Worktree deps fast-path:
  - 웹 (family **A·copy-based**, node_modules): `pnpm install --frozen-lockfile --prefer-offline` — store 와 worktree 가 같은 파일시스템이어야 하드링크된다
  - `app-ios/` (family **B·reference-cache**, pub): `cd app-ios && flutter pub get` (fvm 설정 없음)
- Audit: `pnpm audit`

## Build & Verify — AUTHORITATIVE commands
- Type-check (authoritative): `pnpm typecheck` (= `nuxt typecheck`, 루트 `tsconfig.json` 은 `.nuxt/tsconfig.{app,server,shared,node}.json` 을 references 로 묶는 solution 형태)
  - Vacuity-checked: **yes** (2026-09-28) — `vue-tsc --listFilesOnly` 로 app 93 · server 32 · shared 11 개 소스 파일이 포함됨을 확인
  - Pre-existing error baseline: **0** (7f3d189 기준, exit 0)
- Lint (authoritative): **없음** — ESLint/Prettier/Biome 설정이 없다
- Test (authoritative): `pnpm test` — Vitest, `shared/utils/algorithms.test.ts` 21개 (옛 `__checks.ts` 의 assert 90개 + 일차·공백 규칙 8개, 2026-10-07 통과)
- E2E (authoritative): `pnpm test:e2e` — 9개 통과 (비로그인 5 · 로그인 3 · 일차 기준 1, 2026-10-07). 일차 기준 spec 은 서버 규칙을 빼면 실패하는 것으로 vacuity 확인. 시드를 뒤집으면 비로그인 5개가 모두 실패하는 것으로 vacuity 확인, 로그인 spec 은 실제 버그(틀린 비밀번호 무안내)를 잡아 red → green 확인 (2026-09-28)
- `vitest.config.ts` · `playwright.config.ts` · `tests/e2e/*` 는 `pnpm typecheck` 범위 밖이다 (Nuxt tsconfig 가 포함하지 않음)
- CI 게이트 순서(`.github/workflows/deploy.yml` verify): install → typecheck → `pnpm test` → build. E2E 는 CI 에 없다
