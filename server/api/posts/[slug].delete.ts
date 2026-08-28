/**
 * 기록 삭제 — 포인트와 사진까지 통째로. 되돌릴 수 없다.
 *
 * 🔴 순서가 생명이다.
 *   1) post.cover_photo_id 는 photo(id) 를 참조하는 FK 다. 끊지 않고 사진을 지우면
 *      FOREIGN KEY constraint 로 트랜잭션 전체가 죽는다.
 *   2) point.post_id · photo.point_id 가 ON DELETE CASCADE 라, post 한 줄만 지우면
 *      포인트와 사진 행이 전부 딸려 간다 — 손으로 지울 필요가 없다.
 *   3) 파일은 커밋 «뒤»에 지운다. 트랜잭션 안에서 지웠다가 롤백되면 행은 살아 있는데
 *      파일만 사라져 깨진 이미지가 된다. 반대로 커밋 뒤 프로세스가 죽으면 고아 파일이
 *      남을 뿐이고, 그건 디스크만 먹는다 — 둘 중 덜 나쁜 쪽을 고른다.
 */
import type { PhotoRow } from '#shared/types/db'

export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const slug = getRouterParam(event, 'slug') ?? ''
  const db = useDb()
  const post = db
    .prepare<[string], { id: number; slug: string; title: string }>(
      `SELECT id, slug, title FROM post WHERE slug = ?`,
    )
    .get(slug)
  if (!post) throw createError({ statusCode: 404, statusMessage: '기록을 찾을 수 없습니다' })

  const photos = db
    .prepare<[number], Pick<PhotoRow, 'display_path' | 'thumb_path'>>(
      `SELECT ph.display_path, ph.thumb_path FROM photo ph
        JOIN point pt ON pt.id = ph.point_id WHERE pt.post_id = ?`,
    )
    .all(post.id)
  const pointCount = db
    .prepare<[number], { n: number }>(`SELECT COUNT(*) AS n FROM point WHERE post_id = ?`)
    .get(post.id)?.n ?? 0

  const run = db.transaction(() => {
    db.prepare<[number]>(`UPDATE post SET cover_photo_id = NULL WHERE id = ?`).run(post.id)
    db.prepare<[number]>(`DELETE FROM post WHERE id = ?`).run(post.id)
  })
  run()

  // 이 기록의 사진은 {photos}/{slug}/ 아래에만 있다 — 통째로 지운다.
  // 혹시 디렉터리 밖을 가리키는 행이 있었다면 그것도 지워준다 (경로는 DB 가 준 값 그대로다).
  removePostDir(post.slug)
  removePhotoFiles(photos.flatMap((p) => [p.display_path, p.thumb_path]))

  return { ok: true, removedPoints: pointCount, removedPhotos: photos.length }
})
