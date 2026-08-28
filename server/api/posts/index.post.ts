import type { CreatePostResult } from '#shared/types/upload'

/**
 * 업로드 확정 — 포스트 · 포인트 · 사진 행을 단일 트랜잭션으로 만든다.
 * 바이트는 아직 안 온다. 클라이언트가 photoIds 를 받아 사진별로 PUT 한다 (부분 실패·재시도 때문).
 */
export default defineEventHandler(async (event): Promise<CreatePostResult> => {
  await requireEditor(event)

  const input = validateCreatePost(await readBody(event))
  const db = useDb()
  const now = new Date().toISOString()

  // 포인트 순서는 촬영 시각 순으로 고정한다 — UI 에서 바꿀 수 없는 값이다 (설계문서 §7.2)
  const points = [...input.points].sort((a, b) => (a.first_shot_at ?? '') < (b.first_shot_at ?? '') ? -1 : 1)

  const allShotAt = points
    .flatMap((p) => p.photos.map((ph) => ph.shot_at))
    .filter((s): s is string => !!s)
    .sort()

  const slug = uniqueSlug(db, allShotAt[0] ?? now)

  const run = db.transaction((): CreatePostResult => {
    const postId = Number(
      db
        .prepare(
          `INSERT INTO post (slug, title, summary, started_at, ended_at, is_public, cluster_radius, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, 0, ?, ?, ?)`,
        )
        .run(slug, input.title, allShotAt[0] ?? null, allShotAt.at(-1) ?? null, input.radius, now, now).lastInsertRowid,
    )

    const insertPoint = db.prepare(
      `INSERT INTO point (post_id, lat, lng, title, body, tags, first_shot_at, order_index)
       VALUES (?, ?, ?, ?, NULL, '[]', ?, ?)`,
    )
    // w/h 는 0 으로 두고 바이트 PUT 이 채운다 — 매니페스트는 리사이즈보다 먼저 간다
    const insertPhoto = db.prepare<
      [number, number, number, string | null, string | null, number | null, string | null, number | null, number]
    >(
      `INSERT INTO photo (point_id, display_path, thumb_path, w, h, lat, lng, shot_at, camera, f_number, exposure, iso, order_index)
       VALUES (?, '', '', 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const setPaths = db.prepare(`UPDATE photo SET display_path = ?, thumb_path = ? WHERE id = ?`)

    const photoIds: Record<string, number> = {}
    let firstPhotoId: number | null = null

    points.forEach((pt, pi) => {
      const pointId = Number(
        insertPoint.run(postId, pt.lat, pt.lng, pt.title, pt.first_shot_at, pi).lastInsertRowid,
      )
      // 사진도 촬영 시각 순으로 고정
      const photos = [...pt.photos].sort((a, b) => (a.shot_at ?? '') < (b.shot_at ?? '') ? -1 : 1)
      photos.forEach((ph, phi) => {
        const id = Number(
          insertPhoto.run(
            pointId, ph.lat, ph.lng, ph.shot_at,
            ph.camera, ph.f_number, ph.exposure, ph.iso, phi,
          ).lastInsertRowid,
        )
        setPaths.run(
          photoRelPath(slug, id, 'display', ph.displayExt),
          photoRelPath(slug, id, 'thumb', ph.thumbExt),
          id,
        )
        photoIds[ph.key] = id
        firstPhotoId ??= id
      })
    })

    if (firstPhotoId != null) {
      db.prepare(`UPDATE post SET cover_photo_id = ? WHERE id = ?`).run(firstPhotoId, postId)
    }
    // 포인트 대표도 첫 사진으로 박아둔다 — NULL(「지정 없음」)이라는 상태를 만들지 않는다
    fillPointCovers(postId)

    return { slug, postId, photoIds }
  })

  return run()
})
