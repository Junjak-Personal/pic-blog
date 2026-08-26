/**
 * 사진 순서 저장 — 아트보드 1e 그리드 드래그 결과. order_index 를 배열 순서로 다시 매긴다.
 * 첫 칸이 커버라는 규칙은 클라이언트가 PATCH /api/posts/[slug] 의 cover_photo_id 로 따로 보낸다.
 */
function bad(msg: string): never {
  throw createError({ statusCode: 400, statusMessage: msg })
}

export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const raw: unknown = await readBody(event)
  if (typeof raw !== 'object' || raw === null) bad('본문이 비어 있습니다')
  const b = raw as Record<string, unknown>

  const pointId = b.pointId
  if (typeof pointId !== 'number' || !Number.isInteger(pointId) || pointId <= 0) {
    bad('pointId: 정수여야 합니다')
  }

  const rawIds = b.ids
  if (!Array.isArray(rawIds) || !rawIds.length) bad('ids: 비어 있습니다')
  const ids: number[] = []
  for (const v of rawIds) {
    if (typeof v !== 'number' || !Number.isInteger(v)) bad('ids: 정수 배열이어야 합니다')
    ids.push(v)
  }
  if (new Set(ids).size !== ids.length) bad('ids: 중복된 사진 id 가 있습니다')

  const db = useDb()

  const point = db
    .prepare<[number], { id: number; post_id: number }>(`SELECT id, post_id FROM point WHERE id = ?`)
    .get(pointId)
  if (!point) throw createError({ statusCode: 404, statusMessage: '포인트를 찾을 수 없습니다' })

  const owned = new Set(
    db
      .prepare<[number], { id: number }>(`SELECT id FROM photo WHERE point_id = ?`)
      .all(pointId)
      .map((r) => r.id),
  )
  if (ids.some((id) => !owned.has(id))) bad('ids: 이 포인트의 사진이 아닌 id 가 섞여 있습니다')
  // 일부만 보내면 보내지 않은 사진의 order_index 가 겹쳐 순서가 무너진다 — 전량을 요구한다
  if (ids.length !== owned.size) bad(`ids: 이 포인트의 사진 ${owned.size}장을 전부 순서대로 보내야 합니다`)

  const run = db.transaction(() => {
    const stmt = db.prepare<[number, number]>(`UPDATE photo SET order_index = ? WHERE id = ?`)
    ids.forEach((id, i) => stmt.run(i, id))
    db.prepare<[string, number]>(`UPDATE post SET updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      point.post_id,
    )
  })
  run()

  return { ok: true, count: ids.length }
})
