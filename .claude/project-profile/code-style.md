# Code Style

## Formatting
- Tool: **없음** (ESLint/Prettier/Biome/editorconfig 설정 파일 없음) — 아래는 소스에서 관찰한 관례
- Semicolons: no
- Quotes: single (템플릿 속성은 double)
- Indent: 2 spaces
- Trailing comma: 여러 줄 배열·객체·인자에 붙인다

## Import Patterns
- Alias: `~/` (app), `#shared/` (shared). shared 안에서는 상대 경로 + `.ts` 확장자 (`import { localIso } from './format.ts'` — `node --experimental-strip-types` 로 직접 돌리기 때문)
- Style: named imports. 타입은 `import type`
- 🔴 `#shared/utils/*` 의 값은 **명시적으로 import 한다** — 자동 임포트(unimport) 스캐너가 연속된 `export const` 중 두 번째부터 놓친 적이 있다 (코드 주석으로 반복 기록됨)
- Vue/Nuxt API(`ref`, `computed`, `useFetch`, `useTemplateRef` …)는 자동 임포트에 기댄다. 컴포넌트는 `fit()` 같은 인스턴스 타입이 필요할 때만 명시적으로 import

## Naming
- Variables / Functions: camelCase
- Types/Interfaces: PascalCase (`PostDetail`, `UploadStage`)
- Constants: SCREAMING_SNAKE (`GAP_MINUTES`, `MAX_TITLE`, `DEFAULT_RADIUS`)
- 상태 유니언은 문자열 리터럴 (`type UploadStage = 'idle' | 'loading' | …`)

## SFC 구조
- `<script setup lang="ts">` → `<template>` → `<style scoped>` 순서
- props: `defineProps<{ … }>()` 타입 선언형. 템플릿 ref: `useTemplateRef<…>('name')`
- 사용자에게 보이는 문구는 **한국어 평문** (i18n 없음, `t()` 금지). 인용은 「」

## 주석 관례 (이 프로젝트의 강한 특징)
- 주석은 한국어, «왜» 를 적는다. 실제 겪은 실패를 근거로 남긴다 (「실제로 그랬다」)
- `🔴` = 지우거나 바꾸면 조용히 깨지는 불변식. 손대기 전에 반드시 읽는다
- 설계 근거는 「설계문서 §N」(= `_docs/reference/product-spec/2026-08-25-product-spec.md`), 화면 근거는 「아트보드 1b」 식으로 가리킨다

## Code Ordering
뚜렷한 고정 순서는 없다. 관찰된 경향: 라우트/세션 → 데이터(`useFetch`) → 로컬 상태·computed → 함수. 전역 규칙의 10단계 순서를 따르면 된다.
