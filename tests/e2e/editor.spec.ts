import { expect, test } from '@playwright/test'
import type { PostDetail } from '../../shared/types/db.ts'
import { login, openGate } from './login.ts'
import { SEED } from './seed-data.ts'

test.describe('편집자', () => {
  test('틀린 비밀번호는 거절하고 이유를 보여준다', async ({ page }) => {
    await openGate(page)
    await page.getByLabel('편집 비밀번호').fill('wrong-password')
    const res = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'))
    await page.getByRole('button', { name: '편집 시작' }).click()
    expect((await res).status()).toBe(401)

    await expect(page.getByText('비밀번호가 맞지 않습니다')).toBeVisible()
    await expect(page.getByRole('link', { name: '새 기록' })).toHaveCount(0)
  })

  test('로그인하면 비공개 기록까지 목록에 보인다', async ({ page }) => {
    await login(page)

    for (const post of [SEED.public, SEED.private, SEED.editable]) {
      await expect(page.getByRole('link', { name: post.title, exact: true })).toBeVisible()
    }
  })

  test('기록 제목을 고치면 새로고침 뒤에도 남는다', async ({ page }) => {
    await login(page)
    await page.goto(`/editor/${SEED.editable.slug}`)
    const title = page.getByRole('textbox', { name: '타이틀' })
    await expect(title).toHaveValue(SEED.editable.title)

    const next = `${SEED.editable.title} 수정`
    await title.fill(next)
    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/posts/${SEED.editable.slug}`) && r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: '저장' }).click()
    expect((await saved).status()).toBe(200)

    await page.reload()
    await expect(page.getByRole('textbox', { name: '타이틀' })).toHaveValue(next)
    // 화면이 아니라 서버가 가진 값도 본다
    const res = await page.request.get(`/api/posts/${SEED.editable.slug}`)
    expect((await res.json() as PostDetail).title).toBe(next)
  })
})
