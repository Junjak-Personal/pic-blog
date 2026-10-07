import { expect, test } from '@playwright/test'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import type { PhotoRow, PostDetail, PostSummary } from '../../shared/types/db.ts'
import type { AddPhotosInput, CreatePostInput, CreatePostResult, UploadPhotoInput } from '../../shared/types/upload.ts'
import { login } from './login.ts'

test('사진 동선은 포인트 묶음·표시 순서·대표 위치와 무관하고 추가·삭제 후에도 DB와 일치한다', async ({ page }) => {
  await login(page)

  const photo = (key: string, lat: number, shot_at: string): UploadPhotoInput => ({
    key, lat, lng: 128.4275, shot_at,
    displayExt: 'jpeg', thumbExt: 'jpeg', camera: null, f_number: null, exposure: null, iso: null,
  })
  const a = photo('a', 34.8453, '2026-10-08T10:00:00')
  const b = photo('b', 34.8473, '2026-10-08T10:10:00')
  const c = photo('c', a.lat, '2026-10-08T10:20:00')
  const d = photo('d', 34.8483, '2026-10-08T10:30:00')
  const payload = {
    title: 'E2E 사진 좌표 동선', radius: 500,
    points: [
      { lat: a.lat, lng: a.lng, title: null, first_shot_at: a.shot_at, photos: [c, a] },
      { lat: b.lat, lng: b.lng, title: null, first_shot_at: b.shot_at, photos: [d, b] },
    ],
  } satisfies CreatePostInput
  const created = await page.request.post('/api/posts', { data: payload })
  expect(created.status()).toBe(200)
  const { slug, photoIds } = await created.json() as CreatePostResult
  const url = `/api/posts/${slug}`
  const readPost = async () => {
    const response = await page.request.get(url)
    expect(response.status()).toBe(200)
    return await response.json() as PostDetail
  }

  // A → B → A → D = 약 778m. 포인트 앵커 A → B 만 이으면 222m 로 축약된다.
  const original = await readPost()
  expect(original.point_count).toBe(2)
  expect(original.photo_count).toBe(4)
  expect(original.distance_km).toBe(0.8)
  const pointId = original.points[0]!.id

  const regrouped = await page.request.post(`${url}/regroup`, {
    data: { groups: [{ id: pointId, photoIds: [photoIds.d, photoIds.c, photoIds.b, photoIds.a] }] },
  })
  expect(regrouped.status()).toBe(200)
  const moved = await page.request.patch(`/api/points/${pointId}`, { data: { anchor: 'centroid' } })
  expect(moved.status()).toBe(200)
  const grouped = await readPost()
  expect(grouped.point_count).toBe(1)
  expect(grouped.points[0]!.lat).not.toBe(a.lat)
  expect(grouped.points[0]!.photos.map((p) => p.id)).toEqual([photoIds.d, photoIds.c, photoIds.b, photoIds.a])
  expect(grouped.distance_km).toBe(original.distance_km)

  const reclustered = await page.request.post(`${url}/recluster`, { data: { radius: 500 } })
  expect(reclustered.status()).toBe(200)
  const clustered = await readPost()
  expect(clustered.point_count).toBe(1)
  expect(clustered.distance_km).toBe(original.distance_km)

  const e = photo('e', a.lat, '2026-10-08T10:40:00')
  const added = await page.request.post(`${url}/photos`, {
    data: { joins: [{ pointId: clustered.points[0]!.id, photos: [e] }], news: [] } satisfies AddPhotosInput,
  })
  expect(added.status()).toBe(200)
  const addedIds = await added.json() as Pick<CreatePostResult, 'photoIds'>
  const updated = await readPost()
  expect(updated.photo_count).toBe(5)
  expect(updated.distance_km).toBe(1.1)

  // API 로 저장한 값을 격리 DB 에서도 확인한다. 실제 기록이 있는 data/ 는 쓰지 않는다.
  const db = new Database(resolve('_workspace/e2e/playwright/data/pic-blog.db'), { readonly: true })
  try {
    const saved = db.prepare<[string], Pick<PhotoRow, 'id' | 'lat' | 'lng' | 'shot_at'>>(
      `SELECT ph.id, ph.lat, ph.lng, ph.shot_at FROM photo ph
       JOIN point pt ON pt.id = ph.point_id JOIN post p ON p.id = pt.post_id
       WHERE p.slug = ? ORDER BY ph.shot_at, ph.id`,
    ).all(slug)
    expect(saved.map(({ id: _id, ...p }) => p)).toEqual([a, b, c, d, e].map(({ lat, lng, shot_at }) => ({ lat, lng, shot_at })))
  } finally {
    db.close()
  }

  await page.goto(`/p/${slug}`)
  await expect(page.getByRole('heading', { name: payload.title })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: payload.title })).toBeVisible()
  expect((await readPost()).distance_km).toBe(1.1)
  const listed = await page.request.get('/api/posts')
  const summaries = await listed.json() as PostSummary[]
  expect(summaries.find((p) => p.slug === slug)?.distance_km).toBe(1.1)

  const deleted = await page.request.delete('/api/photos', { data: { ids: [addedIds.photoIds.e] } })
  expect(deleted.status()).toBe(200)
  expect((await readPost()).distance_km).toBe(original.distance_km)
  expect((await page.request.delete(url)).status()).toBe(200)
})
