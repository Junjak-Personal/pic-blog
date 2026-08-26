/**
 * 업로드 실패분 정리 — 「건너뛰고 저장」이 부르는 경로.
 * 바이트가 끝내 도착하지 않은 사진 행을 지운다. 행만 남으면 깨진 이미지가 되므로 조용한 실패다.
 * 사진이 0장이 된 포인트도 같이 지운다.
 *
 * 🔴 순서가 중요하다: post.cover_photo_id 가 참조 중인 사진을 먼저 지우면
 *    FOREIGN KEY constraint 로 트랜잭션 전체가 실패한다. 커버를 먼저 옮긴다.
 */
export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const body = await readBody<{ ids?: unknown }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is number => Number.isInteger(v)) : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: '지울 사진 id 가 없습니다' })

  const db = useDb()
  const placeholders = ids.map(() => '?').join(',')

  const run = db.transaction(() => {
    const rows = db
      .prepare<number[], { id: number; point_id: number; display_path: string; thumb_path: string }>(
        `SELECT id, point_id, display_path, thumb_path FROM photo WHERE id IN (${placeholders})`,
      )
      .all(...ids)
    if (!rows.length) return { ok: true, removedPhotos: 0, removedPoints: 0 }

    // 1) 지워질 사진을 커버로 쓰고 있는 포스트는 살아남는 첫 사진으로 옮긴다 (없으면 NULL)
    const affected = db
      .prepare<number[], { id: number }>(
        `SELECT id FROM post WHERE cover_photo_id IN (${placeholders})`,
      )
      .all(...ids)

    const pickCover = db.prepare<number[], { id: number }>(
      `SELECT ph.id FROM photo ph
       JOIN point pt ON pt.id = ph.point_id
       WHERE pt.post_id = ? AND ph.id NOT IN (${placeholders})
       ORDER BY pt.order_index, ph.order_index
       LIMIT 1`,
    )
    const setCover = db.prepare<[number | null, number]>(`UPDATE post SET cover_photo_id = ? WHERE id = ?`)
    for (const post of affected) {
      setCover.run(pickCover.get(post.id, ...ids)?.id ?? null, post.id)
    }

    // 2) 이제 지워도 FK 가 걸리지 않는다
    removePhotoFiles(rows.flatMap((r) => [r.display_path, r.thumb_path]))
    db.prepare(`DELETE FROM photo WHERE id IN (${placeholders})`).run(...ids)

    // 3) 사진이 0장이 된 포인트 제거
    const countLeft = db.prepare<[number], { n: number }>(
      `SELECT COUNT(*) AS n FROM photo WHERE point_id = ?`,
    )
    const dropPoint = db.prepare<[number]>(`DELETE FROM point WHERE id = ?`)
    let removedPoints = 0
    for (const pointId of [...new Set(rows.map((r) => r.point_id))]) {
      if (countLeft.get(pointId)?.n === 0) {
        dropPoint.run(pointId)
        removedPoints++
      }
    }

    return { ok: true, removedPhotos: rows.length, removedPoints }
  })

  return run()
})
