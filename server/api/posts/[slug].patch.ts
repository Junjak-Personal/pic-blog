import type { PostRow } from '#shared/types/db'

/**
 * 포스트 편집 저장 — 아트보드 1e. 편집 가능한 필드만 받는다 (설계문서 §7.2).
 * slug 는 사진 파일 경로에 박혀 있고(photoStore), started_at/ended_at 은 EXIF 측량값이라
 * 여기서 아예 읽지 않는다. 바디에 섞여 와도 무시된다.
 */
const MAX_TITLE = 200
const MAX_SUMMARY = 1000

function bad(msg: string): never {
  throw createError({ statusCode: 400, statusMessage: msg })
}

export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug) bad('slug 가 없습니다')

  const raw: unknown = await readBody(event)
  if (typeof raw !== 'object' || raw === null) bad('본문이 비어 있습니다')
  const b = raw as Record<string, unknown>

  const db = useDb()
  const post = db.prepare<[string], PostRow>(`SELECT * FROM post WHERE slug = ?`).get(slug)
  if (!post) throw createError({ statusCode: 404, statusMessage: '기록을 찾을 수 없습니다' })

  // 보내지 않은 필드는 현재 값을 그대로 다시 쓴다 — 동적 SET 절보다 바인딩 튜플이 정확하다
  let title = post.title
  if ('title' in b) {
    const v = b.title
    if (typeof v !== 'string') bad('title: 문자열이어야 합니다')
    title = v.trim()
    if (!title) bad('title: 비어 있습니다')
    if (title.length > MAX_TITLE) bad(`title: ${MAX_TITLE}자를 넘습니다`)
  }

  let summary = post.summary
  if ('summary' in b) {
    const v = b.summary
    if (v == null) {
      summary = null
    } else {
      if (typeof v !== 'string') bad('summary: 문자열이어야 합니다')
      const s = v.trim()
      if (s.length > MAX_SUMMARY) bad(`summary: ${MAX_SUMMARY}자를 넘습니다`)
      summary = s || null
    }
  }

  let isPublic = post.is_public
  if ('is_public' in b) {
    const v = b.is_public
    if (typeof v !== 'boolean') bad('is_public: true 또는 false 여야 합니다')
    isPublic = v ? 1 : 0
  }

  let coverPhotoId = post.cover_photo_id
  if ('cover_photo_id' in b) {
    const v = b.cover_photo_id
    if (typeof v !== 'number' || !Number.isInteger(v)) bad('cover_photo_id: 정수여야 합니다')
    // 다른 기록의 사진이 커버가 되면 목록(1a)에 엉뚱한 썸네일이 뜬다 — 소속을 확인한다
    const owned = db
      .prepare<[number, number], { n: number }>(
        `SELECT COUNT(*) AS n FROM photo ph JOIN point pt ON pt.id = ph.point_id WHERE ph.id = ? AND pt.post_id = ?`,
      )
      .get(v, post.id)
    if (!owned?.n) bad('cover_photo_id: 이 기록의 사진이 아닙니다')
    coverPhotoId = v
  }

  db.prepare<[string, string | null, number, number | null, string, number]>(
    `UPDATE post SET title = ?, summary = ?, is_public = ?, cover_photo_id = ?, updated_at = ? WHERE id = ?`,
  ).run(title, summary, isPublic, coverPhotoId, new Date().toISOString(), post.id)

  return { ok: true }
})
