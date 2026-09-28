# UI Components

## Component Library
- Name: **reka-ui** (headless) + 자체 컴포넌트 (`app/components/`)
- Import pattern: reka 컴포넌트는 `reka-ui/nuxt` 모듈로 자동 임포트. 자체 컴포넌트도 자동 임포트되지만 인스턴스 타입이 필요하면 명시적으로 import
- 🔴 dialog · popover · select · menu 같은 인터랙티브 프리미티브는 reka-ui 로 만든다. 자작 금지 (AGENTS.md)
- 예외: 정보 표시용 대화상자는 네이티브 `<dialog>` 를 감싼 `AppDialog.vue` (포커스 가둠·Esc 는 브라우저가 처리)
- 확인 대화상자: `askConfirm({ title, body, confirmLabel, danger })` → `ConfirmDialog.vue` (reka AlertDialog). `window.confirm` 금지

## Icons
- Library: **없음** — 컴포넌트 안 인라인 `<svg>` (stroke 1.75, round cap/join 계열). 22개 컴포넌트가 인라인 SVG 를 쓴다
- 전역 규칙의 material-symbols 우선 규칙은 이 프로젝트에 적용되지 않았다. 새 아이콘도 기존과 같은 인라인 SVG 로 맞춘다

## Design Tokens
- Colors: `app/assets/css/tokens.css` 의 CSS 변수 (OKLCH, `--*-rgb` 채널은 Mapbox 색 파서용 다리). 다크 단일 테마, 라이트 없음
  - 텍스트 `--ink` / `--mid` · 선택·데이터 `--acc` / `--deep` / `--faint` · 면 `--s0`~`--s3` · 주 동작 `--primary-fill` · 입력 `--field` · 동선 전용 `--route` · 파괴 `--danger`
  - 🔴 임의 HEX·px 하드코딩 금지. 필요한 토큰이 없으면 지어내지 말고 보고한다 (AGENTS.md)
- Spacing / radius: `--radius-sm` 6 · `--radius` 10 · `--radius-lg` 14 · `--radius-xl` 18
- Typography: Pretendard / Pretendard JP (jsdelivr CDN, `nuxt.config` 에 배선) — `--font-display` · `--font-body` · `--font-mono`(+ tabular-nums, 좌표·시각·거리·파일명). 새 폰트 추가 금지
- Motion: `motion.css` (`--duration-exit`, `--ease-out`), `prefers-reduced-motion` 존중
- 전역 CSS 파일 추가 금지 (`nuxt.config` 의 `css` 배열을 건드리지 않는다)

## Common Patterns
- 버튼: `base.css` 의 `.btn` + 변형 `.primary` · `.danger` · `.ghost` · `.foot` · `.big` · `.mono`. 배경이나 테두리가 있어야 한다 (아이콘 전용만 ghost)
- 크기: 모바일(≤900px) 헤더 안 컨트롤 36px, 헤더 밖 44px, 입력 폰트 16px 이상 (iOS 확대 방지)
- 모바일 주 동작은 하단 고정 CTA (`BottomCta.vue`), 데스크탑은 헤더 우측
- 폭마다 마크업이 다른 화면이 있다 (미디어쿼리로 줄인 게 아니라 두 벌) — `_docs/reference/e2e-testing` §4
- 지도: `MapFrame` / `TripMap` / `PostsMap` / `BoardMap` 등 용도별 래퍼 + `useMapbox.ts`, 실패 시 `MapFallback`, 로딩 `MapSkeleton`
- iOS 안전영역: `--top-inset` (🔴 지우지 말 것 — README 「iOS PWA 상단」)
- 값·규칙의 SSOT: `_docs/reference/design-system/2026-08-26-design-system.md`, 제품 원칙: `PRODUCT.md`
