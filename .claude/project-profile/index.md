# Project Profile

> Generated: 2026-09-28
> Last updated: 2026-10-07
> Profile-Generated-At: 4dbd485

## Quick Summary
- **Stack**: Nuxt 4.5 + Vue 3.5 + TypeScript(strict) + reka-ui(headless) · SQLite(better-sqlite3) · mapbox-gl · iOS 껍데기 Flutter
- **Runtime**: Node 24 (로컬 · CI · Docker 동일)
- **Package manager**: pnpm 11.28.0 (`packageManager` 필드가 유일한 출처)
- **Test framework**: Vitest (`pnpm test`) · Playwright (`pnpm test:e2e`, 시드 DB · 4610)
- **State management**: 라이브러리 없음 (composable · 모듈 ref · useState)
- **API layer**: manual — Nitro 파일 라우트 + `useFetch`/`$fetch`, 계약 타입은 `shared/types/`
- **CI/CD**: GitHub Actions → self-hosted Docker (`main` push = 운영 배포)

## Profile Files

Relevance: REQUIRED (always read) > HIGH (read if related) > MEDIUM (optional) > SKIPPED (not applicable)

Status tokens: `✅` scanned-from-code · `⏭️` Skipped (not applicable) · `🌱` Seeded (planned + injected from a stack-decision doc, not yet in code).

| File | Relevance | Status | Contents |
|------|-----------|--------|----------|
| [stack.md](./stack.md) | REQUIRED | ✅ | 런타임, 의존성, 빌드·검증 명령 (typecheck 기준선 0) |
| [structure.md](./structure.md) | REQUIRED | ✅ | 디렉토리, 파일 라우팅, 명명 |
| [code-style.md](./code-style.md) | HIGH | ✅ | 포매터 없음 — 관찰된 관례, 명시적 import 규칙, 🔴 주석 |
| [api-layer.md](./api-layer.md) | HIGH | ✅ | 엔드포인트 표, requireEditor, 수동 검증, 스키마 변경 방식 |
| [state-management.md](./state-management.md) | MEDIUM | ✅ | 스토어 없는 네 가지 상태 패턴 |
| [testing.md](./testing.md) | HIGH | ✅ | 게이트, E2E 픽스처(볼트·격리 복사·dev 로그인 경쟁), 에이전트 어댑터 |
| [ui-components.md](./ui-components.md) | MEDIUM | ✅ | reka-ui, 인라인 SVG, 토큰, 버튼·크기 규칙 |
| [deployment.md](./deployment.md) | MEDIUM | ✅ | CI/CD, 환경변수, Docker, 수동 배포 |

## Key Conventions for Agents

1. **i18n 없음·Tailwind 없음** (AGENTS.md 가 전역 규칙을 덮는다). 문구는 한국어 평문, 인용 「」. 스타일은 `tokens.css` 변수 + `<style scoped>` 만, 임의 HEX·px 금지, 새 전역 CSS·폰트 추가 금지
2. **인터랙티브 프리미티브는 reka-ui**. 확인은 `askConfirm()`, 정보 대화상자는 `AppDialog`. `window.confirm` 금지
3. **`#shared/utils/*` 값은 명시적으로 import** — 자동 임포트가 일부 export 를 놓친다
4. **쓰기 엔드포인트는 첫 줄 `requireEditor(event)`**, 읽기 경로는 절대 부르지 않는다. 좌표·촬영 시각·포인트 순서는 측량값이라 API 로 편집하지 않는다
5. **스키마를 바꾸면** `server/utils/db.ts` (`SCHEMA` + `addColumnIfMissing`)와 `shared/types/db.ts` 를 같은 변경에서 고친다. 운영 DB 에는 열 추가만 안전하다
6. **`🔴` 주석은 불변식**이다. 지우거나 우회하기 전에 근거를 읽는다 (예: `--top-inset`, 게이트 폼 `method="post"`, 세션 `maxAge`)
7. **검증 게이트** = `pnpm typecheck`(기준선 0) + `pnpm test`, 화면·권한 동작은 `pnpm test:e2e`. 린터는 없다
8. **`main` push = 운영 배포**. push·머지는 사용자 지시가 있을 때만
9. **로컬 QA 는 `data/` 를 건드리지 않는다** — Playwright 는 시드 DB, 에이전트 QA 는 `NUXT_DATA_DIR` 격리 복사본. 로그인 필요 QA 는 프로덕션 빌드로 띄우고, 업로드는 `tests/fixtures/photos/` 를 쓴다 (testing.md)
10. 설계 근거 SSOT: `_docs/reference/product-spec/2026-08-25-product-spec.md` (코드 주석의 「설계문서 §N」), 문서 배치·토픽 어휘: `_docs/index.md`

## Document buckets

Lifecycle: active/{planning,processing}/ · complete/ · reference/ · deprecated/   (standard — `_docs/index.md` 가 배치 규칙과 토픽 어휘의 SSOT)

| Collection | Holds | Curated by agent? |
|------------|-------|-------------------|
| `intent/`  | request records, head of intent→spec→plan chain | no — append only (아직 폴더 없음) |
| `handoff/` | live work-stream handoffs | prune-to-latest only (아직 폴더 없음) |
<!-- add project collections below; "Curated" MUST say what the agent may rewrite -->

이웃 버킷: `_workspace/` (버리는 산출물, `_workspace/README.md`) · `.claude/wiki/` (에이전트 위키) · `_note/` (사람 소유, 현재 없음 — 생기면 읽기만).

## Agent Loading Guide
- **All agents**: Read this `index.md` (REQUIRED)
- **Read additional files when**:
  - File relevance is REQUIRED or HIGH for your role
  - Your task touches that domain
  - File status is ✅ (not ⏭️ Skipped)

## Changelog
- 2026-09-28: 최초 생성 (7f3d189)
- 2026-09-28: 위험 대응 반영 — vue·vue-router caret 고정, `packageManager` pnpm@11.28.0 단일 출처, 운영 Node 22 → 24, Vitest(`__checks.ts` 이전) · Playwright(시드 DB) 도입, GPS 사진 픽스처, `_workspace/` 루트 정리
- 2026-09-28: Playwright 로그인 spec(E2E 전용 비밀번호) 추가. 그 spec 이 잡은 `EditorGate` 무안내 버그 수정 — 한국어 사유를 HTTP 상태줄이 아니라 응답 본문에서 읽는다
- 2026-10-01: `--update` (7f3d189 → e5315f2). 코드 변경은 이미 반영돼 있어 기준 커밋만 올림. harness 1.35.0 템플릿의 「Fixture files」 행을 testing.md 에 맞춤
- 2026-10-07: 일차 기준(일차별 끝 시각 · 공백) 도입 반영 — `post.day_settings`, `shared/utils/trip-day.ts`, 재묶기 바디, 테스트 수
