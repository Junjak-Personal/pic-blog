import { expect, test } from '@playwright/test'
import type { PostDetail } from '../../shared/types/db.ts'
import { login } from './login.ts'
import { SEED } from './seed-data.ts'

test.describe('일차 기준', () => {
  test('1일차 끝을 02:00 으로 미루면 자정을 넘긴 같은 자리 사진이 한 포인트로 다시 묶인다', async ({ page }) => {
    await login(page)
    await page.goto(`/editor/${SEED.days.slug}`)
    await page.waitForLoadState('networkidle')

    // 기간 8/22 ~ 8/23 → 일차 두 줄. 기본은 자정 경계라 포인트 3개다
    await expect(page.getByTestId('settings-day-1')).toContainText('8/22 00:00 ~ 8/23')
    await expect(page.getByTestId('settings-day-2')).toContainText('8/23 00:00 ~ 8/24')

    await page.getByRole('combobox', { name: '1일차 끝 시각' }).click()
    await page.getByRole('option', { name: '02:00' }).click()
    // 한 일차의 끝이 곧 다음 일차의 시작이다
    await expect(page.getByTestId('settings-day-1')).toContainText('8/22 00:00 ~ 8/23 02:00')
    await expect(page.getByTestId('settings-day-2')).toContainText('8/23 02:00 ~ 8/24 00:00')

    await page.getByRole('button', { name: '일차 기준 적용' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('일차 기준 바뀜')
    await expect(dialog).toContainText('포인트 3개')
    await expect(dialog).toContainText('2개')

    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/posts/${SEED.days.slug}/recluster`) && r.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: '다시 묶기' }).click()
    expect((await saved).status()).toBe(200)

    // 새로고침 뒤에도 남는다 — 화면과 서버 값 둘 다 본다
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('combobox', { name: '1일차 끝 시각' })).toHaveText(/02:00/)

    const post = await (await page.request.get(`/api/posts/${SEED.days.slug}`)).json() as PostDetail
    expect(post.day_settings).toEqual([{ date: '2026-08-22', endTime: '02:00' }])
    expect(post.points.map((p) => p.photos.map((ph) => ph.shot_at))).toEqual([
      ['2026-08-22T23:50:00', '2026-08-23T00:20:00'],
      ['2026-08-23T10:00:00'],
    ])
  })
})
