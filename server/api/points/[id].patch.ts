import type { PointRow } from '#shared/types/db'
import {
  cleanExpenses, cleanLinks, isCurrency, isSafeUrl,
  MAX_AMOUNT, MAX_EXPENSES, MAX_ITEM, MAX_LINK_LABEL, MAX_LINKS, MAX_URL,
  type PointExpense, type PointLink,
} from '#shared/utils/extras'

/**
 * 포인트 편집 저장 — 편집 3단계 「포인트별 기록」.
 * 타이틀 · 태그 · 콘텐츠 · 대표 썸네일 · 기타 정보(링크 · 소비 금액)를 받는다.
 * lat/lng 는 확정된 앵커, first_shot_at 은 EXIF 원본, order_index 는 촬영 시각 순 고정이라
 * 여기서 읽지 않는다 (설계문서 §7.2). 사진의 소속·순서는 regroup 엔드포인트가 소유한다.
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
    .prepare<[number], Pick<PointRow, 'id' | 'post_id' | 'title' | 'body' | 'tags' | 'cover_photo_id' | 'links' | 'expenses'>>(
      `SELECT id, post_id, title, body, tags, cover_photo_id, links, expenses FROM point WHERE id = ?`,
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

  /*
   * 링크. 빈 줄은 「+」 를 눌러놓고 안 채운 자리라 조용히 버린다 — 400 으로 되돌리면
   * 다른 편집까지 통째로 막힌다.
   *
   * 🔴 스킴 검사는 «저장»에서 한다. 화면도 그릴 때 한 번 더 보지만(옛 행이 있을 수 있다),
   *    javascript: 가 DB 에 들어오지 못하게 막는 것이 먼저다 — 클릭 한 번이 스크립트가 된다.
   */
  let links = point.links
  if ('links' in b) {
    const v = b.links
    if (!Array.isArray(v)) bad('links: 배열이어야 합니다')
    if (v.length > MAX_LINKS) bad(`links: ${MAX_LINKS}개를 넘습니다`)
    const cleaned: PointLink[] = []
    for (const one of v) {
      if (typeof one !== 'object' || one === null) bad('links: 객체여야 합니다')
      const l = one as Record<string, unknown>
      if (l.url != null && typeof l.url !== 'string') bad('links.url: 문자열이어야 합니다')
      const url = typeof l.url === 'string' ? l.url.trim() : ''
      if (!url) continue
      if (url.length > MAX_URL) bad(`links.url: ${MAX_URL}자를 넘습니다`)
      if (!isSafeUrl(url)) bad('links.url: http 또는 https 주소여야 합니다')
      const label = typeof l.label === 'string' ? l.label.trim() : ''
      if (label.length > MAX_LINK_LABEL) bad(`links.label: ${MAX_LINK_LABEL}자를 넘습니다`)
      cleaned.push({ label, url })
    }
    // 다듬는 규칙(트림·빈 줄 버리기)은 편집 화면과 «같은» 함수가 갖는다 — extras.ts 의 🔴
    links = JSON.stringify(cleanLinks(cleaned))
  }

  // 소비 금액. 품목도 금액도 비어 있는 줄은 링크와 같은 이유로 버린다.
  let expenses = point.expenses
  if ('expenses' in b) {
    const v = b.expenses
    if (!Array.isArray(v)) bad('expenses: 배열이어야 합니다')
    if (v.length > MAX_EXPENSES) bad(`expenses: ${MAX_EXPENSES}개를 넘습니다`)
    const cleaned: PointExpense[] = []
    for (const one of v) {
      if (typeof one !== 'object' || one === null) bad('expenses: 객체여야 합니다')
      const e = one as Record<string, unknown>
      const item = typeof e.item === 'string' ? e.item.trim() : ''
      if (item.length > MAX_ITEM) bad(`expenses.item: ${MAX_ITEM}자를 넘습니다`)
      if (e.amount != null && typeof e.amount !== 'number') bad('expenses.amount: 숫자여야 합니다')
      const n = typeof e.amount === 'number' ? e.amount : 0
      if (!isFinite(n)) bad('expenses.amount: 숫자여야 합니다')
      if (n < 0) bad('expenses.amount: 0보다 작을 수 없습니다')
      if (n > MAX_AMOUNT) bad('expenses.amount: 값이 너무 큽니다')
      if (typeof e.currency !== 'string' || !isCurrency(e.currency)) bad('expenses.currency: 다루지 않는 화폐입니다')
      cleaned.push({ item, amount: n, currency: e.currency })
    }
    expenses = JSON.stringify(cleanExpenses(cleaned))
  }

  // 대표 썸네일 — 반드시 «이 포인트의» 사진이어야 한다. 남의 사진이 들어오면
  // 지도 마커에 다른 포인트 사진이 뜬다. null 은 「지정 없음 = 첫 사진」이다.
  let coverPhotoId = point.cover_photo_id
  if ('cover_photo_id' in b) {
    const v = b.cover_photo_id
    if (v == null) {
      coverPhotoId = null
    } else {
      if (typeof v !== 'number' || !Number.isInteger(v)) bad('cover_photo_id: 정수여야 합니다')
      const owned = db
        .prepare<[number, number], { n: number }>(
          `SELECT COUNT(*) AS n FROM photo WHERE id = ? AND point_id = ?`,
        )
        .get(v, point.id)
      if (!owned?.n) bad('cover_photo_id: 이 포인트의 사진이 아닙니다')
      coverPhotoId = v
    }
  }

  const now = new Date().toISOString()
  const run = db.transaction(() => {
    db.prepare<[string | null, string | null, string, number | null, string, string, number]>(
      `UPDATE point SET title = ?, body = ?, tags = ?, cover_photo_id = ?, links = ?, expenses = ? WHERE id = ?`,
    ).run(title, body, tags, coverPhotoId, links, expenses, point.id)
    // 첫 포인트의 대표가 곧 기록의 커버다 — 목록(1a) 썸네일이 따라가야 한다
    syncPostCover(point.post_id)
    // 목록(1a)의 정렬·표시가 post.updated_at 을 본다 — 포인트만 고쳐도 포스트가 갱신돼야 한다
    db.prepare<[string, number]>(`UPDATE post SET updated_at = ? WHERE id = ?`).run(now, point.post_id)
  })
  run()

  return { ok: true }
})
