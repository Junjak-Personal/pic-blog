import type { UploadPhotoInput } from '#shared/types/upload'

/**
 * 사진 추가 (아트보드 1f) — 기존 포스트에 사진을 붙인다.
 *
 * 🔴 기존 포인트의 중심 좌표는 절대 움직이지 않는다 (설계문서 §4.2).
 *    합류하는 사진은 그 포인트의 촬영 시각 순 "뒤"에 붙는다.
 * 최초 업로드와 마찬가지로 바이트는 아직 오지 않는다 — photoIds 를 받아 사진별로 PUT 한다.
 */
export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'slug 가 없습니다' })

  const input = validateAddPhotos(await readBody(event))
  const db = useDb()
  const now = new Date().toISOString()

  const found = db
    .prepare<[string], { id: number; slug: string }>(`SELECT id, slug FROM post WHERE slug = ?`)
    .get(slug)
  if (!found) throw createError({ statusCode: 404, statusMessage: '기록을 찾을 수 없습니다' })
  // 클로저 안에서는 위 좁히기가 풀리므로 값을 고정해 넘긴다
  const post = found

  const run = db.transaction(() => {
    // w/h 는 0 으로 두고 바이트 PUT 이 채운다 — 매니페스트는 리사이즈보다 먼저 간다
    const insertPhoto = db.prepare<
      [number, number, number, string | null, string | null, number | null, string | null, number | null, number]
    >(
      `INSERT INTO photo (point_id, display_path, thumb_path, w, h, lat, lng, shot_at, camera, f_number, exposure, iso, order_index)
       VALUES (?, '', '', 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const setPaths = db.prepare<[string, string, number]>(
      `UPDATE photo SET display_path = ?, thumb_path = ? WHERE id = ?`,
    )
    const nextOrder = db.prepare<[number], { n: number | null }>(
      `SELECT MAX(order_index) AS n FROM photo WHERE point_id = ?`,
    )
    const ownsPoint = db.prepare<[number, number], { id: number }>(
      `SELECT id FROM point WHERE id = ? AND post_id = ?`,
    )

    const photoIds: Record<string, number> = {}

    function addPhoto(pointId: number, ph: UploadPhotoInput, orderIndex: number) {
      const id = Number(
        insertPhoto.run(
          pointId, ph.lat, ph.lng, ph.shot_at,
          ph.camera, ph.f_number, ph.exposure, ph.iso, orderIndex,
        ).lastInsertRowid,
      )
      setPaths.run(
        photoRelPath(post.slug, id, 'display', ph.displayExt),
        photoRelPath(post.slug, id, 'thumb', ph.thumbExt),
        id,
      )
      photoIds[ph.key] = id
      return id
    }

    // 1) 기존 포인트에 합류 — 중심 좌표는 건드리지 않는다
    for (const join of input.joins) {
      if (!ownsPoint.get(join.pointId, post.id)) {
        throw createError({
          statusCode: 400,
          statusMessage: `포인트 ${join.pointId} 는 이 기록에 속하지 않습니다`,
        })
      }
      let order = (nextOrder.get(join.pointId)?.n ?? -1) + 1
      // 합류 사진끼리도 촬영 시각 순으로 뒤에 붙인다
      const sorted = [...join.photos].sort((a, b) => (a.shot_at ?? '') < (b.shot_at ?? '') ? -1 : 1)
      for (const ph of sorted) addPhoto(join.pointId, ph, order++)
    }

    // 2) 새 포인트 — order_index 는 촬영 시각 순으로 전체 재배열한다
    const insertPoint = db.prepare<[number, number, number, string | null, number]>(
      `INSERT INTO point (post_id, lat, lng, title, body, tags, first_shot_at, order_index)
       VALUES (?, ?, ?, NULL, NULL, '[]', ?, ?)`,
    )
    for (const pt of input.news) {
      const sorted = [...pt.photos].sort((a, b) => (a.shot_at ?? '') < (b.shot_at ?? '') ? -1 : 1)
      // order_index 는 아래에서 다시 매기므로 임시로 큰 값을 넣는다
      const pointId = Number(
        insertPoint.run(post.id, pt.lat, pt.lng, pt.first_shot_at, 9999).lastInsertRowid,
      )
      sorted.forEach((ph, i) => addPhoto(pointId, ph, i))
    }

    // 포인트 순서는 촬영 시각 순 고정 — 새 포인트가 끼어들면 전체를 다시 매긴다 (§7.2)
    const all = db
      .prepare<[number], { id: number; first_shot_at: string | null }>(
        `SELECT id, first_shot_at FROM point WHERE post_id = ?
         ORDER BY COALESCE(first_shot_at, '9999') , id`,
      )
      .all(post.id)
    const setOrder = db.prepare<[number, number]>(`UPDATE point SET order_index = ? WHERE id = ?`)
    all.forEach((p, i) => setOrder.run(i, p.id))

    // 기간도 새 사진을 반영해 넓힌다 (촬영 시각 파생값이라 편집 대상이 아니다)
    db.prepare<[number, number, string, number]>(
      `UPDATE post SET
         started_at = (SELECT MIN(ph.shot_at) FROM photo ph JOIN point pt ON pt.id = ph.point_id WHERE pt.post_id = ?),
         ended_at   = (SELECT MAX(ph.shot_at) FROM photo ph JOIN point pt ON pt.id = ph.point_id WHERE pt.post_id = ?),
         updated_at = ?
       WHERE id = ?`,
    ).run(post.id, post.id, now, post.id)

    return { slug: post.slug, postId: post.id, photoIds }
  })

  return run()
})
