import { expect, test } from '@playwright/test'
import type { PostDetail } from '../../shared/types/db.ts'
import { photoPath, SEED } from './seed-data.ts'

/** 비공개 403 의 data — 통계와 기간만 싣는다 (server/api/posts/[slug].get.ts) */
type PrivateNotice = Pick<PostDetail, 'title' | 'point_count' | 'photo_count' | 'started_at' | 'ended_at'> & {
  private: true
}

test.describe('비로그인 비공개 기록', () => {
  test('상세 API 는 403 과 통계만 준다 — 좌표·사진은 없다', async ({ request }) => {
    const res = await request.get(`/api/posts/${SEED.private.slug}`)
    expect(res.status()).toBe(403)

    const body = await res.json() as { data: PrivateNotice }
    expect(body.data).toMatchObject({ private: true, title: SEED.private.title, point_count: 1, photo_count: 1 })
    expect(body.data).not.toHaveProperty('points')
  })

  test('사진 파일도 막힌다 — 공개 기록 사진은 열린다', async ({ request }) => {
    for (const variant of ['display', 'thumb'] as const) {
      expect((await request.get(photoPath(SEED.private, variant))).status()).toBe(401)
    }

    const open = await request.get(photoPath(SEED.public, 'display'))
    expect(open.status()).toBe(200)
    expect(open.headers()['content-type']).toBe('image/jpeg')
  })

  test('상세 화면은 비공개 안내를 보여준다', async ({ page }) => {
    await page.goto(`/p/${SEED.private.slug}`)

    await expect(page.getByText('비공개 기록입니다')).toBeVisible()
    await expect(page.getByText('1 포인트 · 1장')).toBeVisible()
  })
})
