import { defineConfig, devices } from '@playwright/test'
import { EDITOR_PASSWORD_HASH } from './tests/e2e/seed-data.ts'

/**
 * E2E — 프로덕션 빌드를 «격리된 시드 DB» 로 띄워 검사한다.
 *
 * 🔴 로컬 data/ 는 절대 쓰지 않는다. seed.ts 가 NUXT_DATA_DIR 를 비우고 다시 만든다.
 * 🔴 dev 서버가 아니라 빌드 산출물을 쓴다 — dev 모드는 하이드레이션이 늦어 폼 제출이
 *    네이티브 POST 로 새는 일이 있다 (.claude/project-profile/testing.md).
 * 포트는 개발 서버(4600)와 겹치지 않게 따로 둔다. 지도 타일은 Mapbox 토큰 URL 제한 때문에
 * 이 포트에서 뜨지 않으므로, 지도에 기대는 검사는 여기서 하지 않는다.
 */
const PORT = 4610
const OUT = '_workspace/e2e/playwright'

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: `${OUT}/test-results`,
  reporter: [['list'], ['html', { outputFolder: `${OUT}/report`, open: 'never' }]],
  // 서버 하나 · DB 하나를 같이 쓴다
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && node tests/e2e/seed.ts && node .output/server/index.mjs',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      PORT: String(PORT),
      HOST: 'localhost',
      NUXT_DATA_DIR: `${OUT}/data`,
      // 테스트 전용 값이다 — 운영 비밀이 아니다
      NUXT_SESSION_PASSWORD: 'e2e-only-session-password-not-a-secret',
      NUXT_ADMIN_PASSWORD_HASH: EDITOR_PASSWORD_HASH,
    },
  },
})
