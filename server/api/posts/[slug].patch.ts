import type { PostRow } from '#shared/types/db'

/**
 * 포스트 편집 저장 — 편집 1단계 「기본 정보」. slug 는 사진 파일 경로에 박혀 있어(photoStore)
 * 여기서 읽지 않는다. 바디에 섞여 와도 무시된다.
 *
 * started_at/ended_at 은 원래 EXIF 측량값이라 읽기 전용이었는데, 손으로 고칠 수 있게 열었다.
 * 🔴 사진을 추가하면 photos.post.ts 가 MIN/MAX(shot_at) 으로 이 둘을 다시 계산한다 —
 *    즉 손으로 고친 기간은 다음 사진 추가 때 EXIF 값으로 되돌아간다. 의도된 동작이고,
 *    편집 화면이 그 자리에서 그렇게 알린다. 안 알리면 조용한 실패다 (설계문서 §8).
 */
const MAX_TITLE = 200
const MAX_SUMMARY = 1000
/** shot_at 과 같은 「타임존 없는 벽시계」 문자열만 받는다 — Date 로 파싱하면 UTC 로 밀린다 */
const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

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

  // 기간 — 둘 다 null 이면 「기간 없음」이다. 형식은 shot_at 과 같아야 정렬·비교가 맞는다.
  // 화살표 상수여야 한다 — function 선언은 호이스팅돼서 위의 `if (!post) throw` 로 좁혀진
  // 타입을 못 받는다 (post 가 다시 undefined 가능으로 보인다)
  const period = (field: 'started_at' | 'ended_at') => {
    const cur = post[field]
    if (!(field in b)) return cur
    const v = b[field]
    if (v == null) return null
    if (typeof v !== 'string' || !LOCAL_ISO.test(v)) {
      bad(`${field}: YYYY-MM-DDTHH:mm:ss 형식이어야 합니다`)
    }
    return v
  }
  const startedAt = period('started_at')
  const endedAt = period('ended_at')
  // 고정 폭 문자열이라 사전순 비교가 곧 시각 순이다
  if (startedAt && endedAt && startedAt > endedAt) bad('기간: 시작이 종료보다 늦습니다')


  // 커버는 여기서 받지 않는다 — 「첫 포인트의 대표 썸네일」 규칙이라 포인트 구성·대표 지정이
  // 바뀔 때 syncPostCover() 가 스스로 세운다. 두 곳에서 쓰면 저장 순서에 따라 값이 갈린다.
  db.prepare<[string, string | null, number, string | null, string | null, string, number]>(
    `UPDATE post
        SET title = ?, summary = ?, is_public = ?, started_at = ?, ended_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(title, summary, isPublic, startedAt, endedAt, new Date().toISOString(), post.id)

  return { ok: true }
})
