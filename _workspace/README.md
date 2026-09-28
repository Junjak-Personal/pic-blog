# _workspace/ — throwaway run output

Gitignored except this file. Everything here is disposable; delete freely.
**Before writing here, read this file** — it says which context folder a file belongs in.
**After adding a new context folder, add a row here** so the next session reuses it.

| Folder | What goes in it |
|--------|-----------------|
| `e2e/` | Playwright/E2E run output — `<YYYY-MM-DD>-<test-name>/{screenshots,artifacts,report}/`, run.log. `e2e/playwright/` 는 `pnpm test:e2e` 가 매번 덮어쓴다 (시드 DB `data/` · `test-results/` · `report/`) |
| `deisgn/` | 아트보드 원본 캔버스·목업 스크립트·디자인 수정 요청. `data.js` 는 `shared/utils/algorithms.test.ts` 와 클러스터링 코드 주석이 원본으로 가리킨다 — 지우지 말 것 |
| `ios-keyboard/` | 아이폰 키보드 조사 로그 `kbprobe-*.log` (`_docs/active/processing/2026-08-31/` 참고) |
| `bootstrap/` | 최초 구현 착수 프롬프트 |

Rules: one folder per purpose, named for that purpose. A bare file at `_workspace/` root
or at the repo root is a defect. Vendor state paths win (Playwright auth → `playwright/.auth/`).
