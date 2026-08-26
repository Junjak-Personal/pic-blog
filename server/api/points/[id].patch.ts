import type { PointRow } from '#shared/types/db'

/**
 * 포인트 편집 저장 — 아트보드 1e. 타이틀 · 태그 · 콘텐츠만 받는다 (설계문서 §7.2).
 * lat/lng 는 확정된 앵커, first_shot_at 은 EXIF 원본, order_index 는 촬영 시각 순 고정이라
 * 여기서 읽지 않는다.
 */
const MAX_TITLE = 200
const MAX_BODY = 2000
const MAX_TAGS = 20
const MAX_TAG_LEN = 40

function bad(msg: string): never {
  throw createError({ statusCode: 400, statusMessage: msg })
}

export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) bad('잘못된 포인트 id')

  const raw: unknown = await readBody(event)
  if (typeof raw !== 'object' || raw === null) bad('본문이 비어 있습니다')
  const b = raw as Record<string, unknown>

  const db = useDb()
  const point = db
    .prepare<[number], Pick<PointRow, 'id' | 'post_id' | 'title' | 'body' | 'tags'>>(
      `SELECT id, post_id, title, body, tags FROM point WHERE id = ?`,
    )
    .get(id)
  if (!point) throw createError({ statusCode: 404, statusMessage: '포인트를 찾을 수 없습니다' })

  let title = point.title
  if ('title' in b) {
    const v = b.title
    if (v == null) {
      title = null
    } else {
      if (typeof v !== 'string') bad('title: 문자열이어야 합니다')
      const s = v.trim()
      if (s.length > MAX_TITLE) bad(`title: ${MAX_TITLE}자를 넘습니다`)
      title = s || null
    }
  }

  let body = point.body
  if ('body' in b) {
    const v = b.body
    if (v == null) {
      body = null
    } else {
      if (typeof v !== 'string') bad('body: 문자열이어야 합니다')
      // 앞뒤 공백만 털어낸다 — 문단 사이 줄바꿈은 콘텐츠다
      const s = v.trim()
      if (s.length > MAX_BODY) bad(`body: ${MAX_BODY}자를 넘습니다`)
      body = s || null
    }
  }

  let tags = point.tags
  if ('tags' in b) {
    const v = b.tags
    if (!Array.isArray(v)) bad('tags: 배열이어야 합니다')
    if (v.length > MAX_TAGS) bad(`tags: ${MAX_TAGS}개를 넘습니다`)
    const cleaned: string[] = []
    for (const t of v) {
      if (typeof t !== 'string') bad('tags: 문자열만 담을 수 있습니다')
      const s = t.trim()
      if (!s) continue
      if (s.length > MAX_TAG_LEN) bad(`tags: 태그 하나가 ${MAX_TAG_LEN}자를 넘습니다`)
      if (!cleaned.includes(s)) cleaned.push(s)
    }
    tags = JSON.stringify(cleaned)
  }

  const now = new Date().toISOString()
  const run = db.transaction(() => {
    db.prepare<[string | null, string | null, string, number]>(
      `UPDATE point SET title = ?, body = ?, tags = ? WHERE id = ?`,
    ).run(title, body, tags, point.id)
    // 목록(1a)의 정렬·표시가 post.updated_at 을 본다 — 포인트만 고쳐도 포스트가 갱신돼야 한다
    db.prepare<[string, number]>(`UPDATE post SET updated_at = ? WHERE id = ?`).run(now, point.post_id)
  })
  run()

  return { ok: true }
})
