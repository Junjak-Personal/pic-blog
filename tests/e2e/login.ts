import { expect, type Page } from '@playwright/test'
import { EDITOR_PASSWORD } from './seed-data.ts'

/** 게이트를 연다. 판정은 로그인 후에만 있는 요소로 한다 — 게이트와 목록이 같은 URL(/editor)이다. */
export async function openGate(page: Page) {
  await page.goto('/editor')
  // 🔴 하이드레이션 전에 제출하면 폼이 네이티브 POST 로 새서 로그인이 안 된다 (.claude/project-profile/testing.md)
  await page.waitForLoadState('networkidle')
}

export async function login(page: Page) {
  await openGate(page)
  await page.getByLabel('편집 비밀번호').fill(EDITOR_PASSWORD)
  const res = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'))
  await page.getByRole('button', { name: '편집 시작' }).click()
  expect((await res).status()).toBe(200)
  await expect(page.getByRole('link', { name: '새 기록' })).toBeVisible()
}
