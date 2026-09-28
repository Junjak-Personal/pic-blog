import { expect, test } from '@playwright/test'
import type { PostSummary } from '../../shared/types/db.ts'
import { SEED } from './seed-data.ts'

test.describe('비로그인 목록', () => {
  test('API 는 공개 기록만 준다', async ({ request }) => {
    const res = await request.get('/api/posts')
    expect(res.status()).toBe(200)

    const slugs = (await res.json() as PostSummary[]).map((p) => p.slug)
    expect(slugs).toEqual([SEED.public.slug])
  })

  test('홈 화면에 공개 기록만 보인다', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: new RegExp(SEED.public.title) })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(SEED.private.title) })).toHaveCount(0)
  })
})
