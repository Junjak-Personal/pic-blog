/**
 * 사진 1장 삭제 — 아트보드 1e 그리드의 × 버튼.
 * 행과 파일을 함께 지운다. 행만 남기면 깨진 이미지, 파일만 남기면 고아 파일이 된다.
 * 사후 정리 규칙(빈 포인트 제거 · 커버 이전)은 index.delete.ts 와 같은 문장을 쓴다.
 */
export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: '잘못된 사진 id' })
  }

  const db = useDb()

  const run = db.transaction(() => {
    const row = db
      .prepare<[number], { id: number; point_id: number; display_path: string; thumb_path: string }>(
        `SELECT id, point_id, display_path, thumb_path FROM photo WHERE id = ?`,
      )
      .get(id)
    if (!row) throw createError({ statusCode: 404, statusMessage: '사진을 찾을 수 없습니다' })

    // 포인트를 지우기 전에 소속 포스트를 붙잡아 둔다 — 지운 뒤에는 되짚을 수 없다
    const owner = db
      .prepare<[number], { post_id: number }>(`SELECT post_id FROM point WHERE id = ?`)
      .get(row.point_id)

    // 🔴 커버를 먼저 옮긴다 (index.delete.ts 와 같은 순서). post.cover_photo_id 가 참조 중인
    //    사진을 먼저 지우면 FOREIGN KEY constraint 로 트랜잭션 전체가 실패한다 —
    //    그리드 첫 칸(=커버)을 지우는 것이 가장 흔한 조작이라 그냥 두면 항상 500 이다.
    if (owner) {
      const isCover = db
        .prepare<[number, number], { n: number }>(
          `SELECT COUNT(*) AS n FROM post WHERE id = ? AND cover_photo_id = ?`,
        )
        .get(owner.post_id, id)
      if (isCover?.n) {
        const next = db
          .prepare<[number, number], { id: number }>(
            `SELECT ph.id FROM photo ph
             JOIN point pt ON pt.id = ph.point_id
             WHERE pt.post_id = ? AND ph.id != ?
             ORDER BY pt.order_index, ph.order_index
             LIMIT 1`,
          )
          .get(owner.post_id, id)
        db.prepare<[number | null, number]>(`UPDATE post SET cover_photo_id = ? WHERE id = ?`).run(
          next?.id ?? null,
          owner.post_id,
        )
      }
    }

    removePhotoFiles([row.display_path, row.thumb_path])
    db.prepare<[number]>(`DELETE FROM photo WHERE id = ?`).run(id)

    // 사진이 0장이 된 포인트는 지도에 좌표만 남은 유령이 된다
    const left = db
      .prepare<[number], { n: number }>(`SELECT COUNT(*) AS n FROM photo WHERE point_id = ?`)
      .get(row.point_id)
    const removedPoints = left?.n === 0 ? 1 : 0
    if (removedPoints) db.prepare<[number]>(`DELETE FROM point WHERE id = ?`).run(row.point_id)

    if (owner) {
      db.prepare<[string, number]>(`UPDATE post SET updated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        owner.post_id,
      )
    }

    return { ok: true, removedPhotos: 1, removedPoints }
  })

  return run()
})
