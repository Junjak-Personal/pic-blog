/**
 * E2E 시드 — 공개 기록 1개와 비공개 기록 2개(하나는 편집 spec 전용)를 «빈» 데이터 디렉토리에 만든다.
 * Playwright webServer 가 서버를 띄우기 직전에 `node tests/e2e/seed.ts` 로 부른다.
 *
 * 🔴 NUXT_DATA_DIR 를 통째로 지우고 다시 만든다. 저장소의 data/(개발자의 실제 로컬 기록)를
 *    가리키면 거부한다 — 시드가 그걸 날리면 되돌릴 방법이 없다.
 */
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { SCHEMA } from '../../server/utils/db.ts'
import { DAYS_SHOTS, SEED, type SeedPost } from './seed-data.ts'

const root = resolve(import.meta.dirname, '../..')
const dataDir = resolve(root, process.env.NUXT_DATA_DIR ?? '')

if (!process.env.NUXT_DATA_DIR || dataDir === resolve(root, 'data')) {
  throw new Error(`E2E 시드: NUXT_DATA_DIR 가 비었거나 로컬 data/ 를 가리킨다 (${dataDir})`)
}

rmSync(dataDir, { recursive: true, force: true })
mkdirSync(join(dataDir, 'photos'), { recursive: true })

const db = new Database(join(dataDir, 'pic-blog.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(SCHEMA)

const now = new Date().toISOString()
const fixture = resolve(root, 'tests/fixtures/photos/a1-dongpirang.jpg')

/**
 * 촬영 시각마다 포인트 하나 · 사진 하나 (모두 같은 자리). 사진 id 는 post.photoId 부터 잇는다.
 * 포인트 이름은 비워 둔다 — 재묶기 확인창이 「잃을 내용 없음」 쪽으로 뜨게.
 */
const seedPost = (post: SeedPost, isPublic: boolean, shots: readonly string[] = ['2026-03-14T10:00:00']) => {
  const { id } = post
  db.prepare(
    `INSERT INTO post (id, slug, title, summary, cover_photo_id, started_at, ended_at, is_public, cluster_radius, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 50, ?, ?)`,
  ).run(id, post.slug, post.title, shots[0], shots.at(-1), isPublic ? 1 : 0, now, now)

  const dir = join(dataDir, 'photos', post.slug)
  mkdirSync(dir, { recursive: true })
  shots.forEach((shotAt, i) => {
    const photoId = post.photoId + i
    const pointId = Number(
      db.prepare(
        `INSERT INTO point (post_id, lat, lng, title, first_shot_at, order_index, cover_photo_id)
         VALUES (?, 34.8453, 128.4275, NULL, ?, ?, ?)`,
      ).run(id, shotAt, i, photoId).lastInsertRowid,
    )
    for (const variant of ['display', 'thumb'] as const) {
      copyFileSync(fixture, join(dir, `${photoId}_${variant}.jpg`))
    }
    db.prepare(
      `INSERT INTO photo (id, point_id, display_path, thumb_path, w, h, lat, lng, shot_at, camera, order_index)
       VALUES (?, ?, ?, ?, 640, 480, 34.8453, 128.4275, ?, 'QA fixture', 0)`,
    ).run(photoId, pointId, `${post.slug}/${photoId}_display.jpg`, `${post.slug}/${photoId}_thumb.jpg`, shotAt)
  })
  // post.cover_photo_id 는 photo 를 참조한다(FK) — 사진을 넣은 뒤에 건다
  db.prepare(`UPDATE post SET cover_photo_id = ? WHERE id = ?`).run(post.photoId, id)
}

seedPost(SEED.public, true)
seedPost(SEED.private, false)
seedPost(SEED.editable, false)
seedPost(SEED.days, false, DAYS_SHOTS)
db.close()

console.log(`E2E 시드 완료: ${dataDir}`)
