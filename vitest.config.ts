import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 범위를 못 박는다 — 기본 패턴은 tests/e2e 의 Playwright spec 까지 집어 Vitest 로 돌린다
    include: ['shared/**/*.test.ts'],
  },
})
