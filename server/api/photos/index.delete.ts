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

    // 포인트가 지워지기 «전»에 소속 포스트를 붙잡아 둔다 — 지운 뒤에는 되짚을 수 없다
    const affectedPosts = [
      ...new Set(
        db
          .prepare<number[], { post_id: number }>(
            `SELECT DISTINCT post_id FROM point WHERE id IN (${rows.map(() => '?').join(',')})`,
          )
          .all(...rows.map((r) => r.point_id))
          .map((r) => r.post_id),
      ),
    ]

    // 1) FK 를 먼저 푼다 — 커버가 가리키는 행을 지우면 트랜잭션 전체가 죽는다.
    //    제자리는 아래 syncPostCover 가 잡아주므로 여기서는 참조만 끊는다.
    const affected = db
      .prepare<number[], { id: number }>(
        `SELECT id FROM post WHERE cover_photo_id IN (${placeholders})`,
      )
      .all(...ids)
    const setCover = db.prepare<[number | null, number]>(`UPDATE post SET cover_photo_id = ? WHERE id = ?`)
    for (const post of affected) setCover.run(null, post.id)

    // 2) 이제 지워도 FK 가 걸리지 않는다
    removePhotoFiles(rows.flatMap((r) => [r.display_path, r.thumb_path]))
    db.prepare(`DELETE FROM photo WHERE id IN (${placeholders})`).run(...ids)

    // 3) 지운 사진을 대표 썸네일로 붙들고 있는 포인트를 되돌린다 (FK 가 아니라 조용히 남는다)
    db.prepare(`UPDATE point SET cover_photo_id = NULL WHERE cover_photo_id IN (${placeholders})`).run(...ids)

    // 4) 사진이 0장이 된 포인트 제거
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

    // 5) 포인트가 사라졌을 수 있으므로 커버는 마지막에 규칙대로 다시 세운다
    for (const post of affectedPosts) syncPostCover(post)

    return { ok: true, removedPhotos: rows.length, removedPoints }
  })

  return run()
})
