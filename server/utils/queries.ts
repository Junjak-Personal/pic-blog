import type { PhotoRow, PointRow, PostDetail, PostRow, PostSummary } from '#shared/types/db'
import { distanceKm } from '#shared/utils/geo'
import { parseTags } from '#shared/utils/format'
import { parseExpenses, parseLinks } from '#shared/utils/extras'

const PHOTO_URL = '/photos/'

function photoUrls(row: PhotoRow) {
  return {
    ...row,
    display_path: PHOTO_URL + row.display_path,
    thumb_path: PHOTO_URL + row.thumb_path,
  }
}

/** 동선 길이 — first_shot_at 순으로 앵커를 이은 총 거리 (km). */
function routeKm(points: ReadonlyArray<{ lat: number; lng: number }>) {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += distanceKm([points[i - 1]!.lat, points[i - 1]!.lng], [points[i]!.lat, points[i]!.lng])
  }
  return +total.toFixed(1)
}

/**
 * 대표 썸네일이 비어 있는 포인트를 그 포인트의 «첫 사진»으로 채운다.
 *
 * 예전에는 NULL 이 「지정 없음 = 첫 사진을 쓴다」는 뜻이었고 화면이 그걸 「기본」이라
 * 따로 불렀는데, 보는 사람에게는 둘 다 그냥 대표 사진이라 나눌 이유가 없었다.
 * 값을 명시적으로 박아 그 개념을 없앤다.
 *
 * 🔴 동작은 «바뀌지 않는다». 읽는 쪽(pointThumb)이 이미 NULL 을 첫 사진으로 되짚고
 *    있었으므로 이 UPDATE 는 화면에 뜨는 사진을 하나도 바꾸지 않는다 — 저장된 값이
 *    화면과 같아질 뿐이다. 그래서 몇 번을 돌려도 안전하다.
 */
export function fillPointCovers(postId?: number) {
  const db = useDb()
  const where = postId == null ? '' : ' AND pt.post_id = @postId'
  db.prepare(
    `UPDATE point AS pt
        SET cover_photo_id = (SELECT ph.id FROM photo ph WHERE ph.point_id = pt.id ORDER BY ph.order_index, ph.id LIMIT 1)
      WHERE pt.cover_photo_id IS NULL
        AND EXISTS (SELECT 1 FROM photo ph WHERE ph.point_id = pt.id)${where}`,
  ).run(postId == null ? {} : { postId })
}

/**
 * 포스트 커버가 «성립하는지» 확인하고, 아니면 규칙대로 다시 세운다.
 *
 * 커버는 사용자가 편집 2단계에서 직접 고른다 (「커버 지정」). 그 선택이 SSOT 이므로
 * 살아 있는 사진을 가리키고 있으면 여기서 손대지 않는다 — 사진을 옮기거나 순서를
 * 바꿨다고 고른 커버가 말없이 바뀌면 그건 예고 없는 결과다.
 *
 * 고른 적이 없거나(NULL) 그 사진이 지워졌을 때만 자동으로 채운다:
 * 「첫 포인트의 대표 썸네일 → 없으면 그 포인트의 첫 사진」.
 *
 * 커버를 건드릴 수 있는 모든 경로(업로드 · 사진 추가 · 사진 삭제 · 포인트 재구성)가
 * 마지막에 이 함수 하나를 부른다 — 각자 고르게 두면 규칙이 갈린다.
 *
 * 🔴 호출하는 쪽 트랜잭션 «안»에서 부른다. post.cover_photo_id 는 FK 라
 *    참조 중인 사진을 지우기 «전»에 먼저 피신시켜 두어야 한다 — 이 함수는 그 뒤를 정리한다.
 */
export function syncPostCover(postId: number) {
  const db = useDb()
  // 커버를 건드리는 모든 경로가 여기를 지난다 — 포인트 대표도 같이 채워둔다
  fillPointCovers(postId)

  // 지금 커버가 이 기록의 살아 있는 사진이면 그대로 둔다 (사용자가 고른 값일 수 있다)
  const current = db
    .prepare<[number], { cover_photo_id: number | null }>(`SELECT cover_photo_id FROM post WHERE id = ?`)
    .get(postId)?.cover_photo_id ?? null
  if (current !== null) {
    const alive = db
      .prepare<[number, number], { n: number }>(
        `SELECT COUNT(*) AS n FROM photo ph JOIN point pt ON pt.id = ph.point_id
          WHERE ph.id = ? AND pt.post_id = ?`,
      )
      .get(current, postId)
    if (alive?.n) return current
  }

  const first = db
    .prepare<[number], { id: number; cover_photo_id: number | null }>(
      `SELECT id, cover_photo_id FROM point WHERE post_id = ? ORDER BY order_index LIMIT 1`,
    )
    .get(postId)

  let cover: number | null = null
  if (first) {
    // 지정이 지워진 사진을 가리키고 있을 수 있다 — 실재를 확인하고 아니면 첫 사진으로 내려간다
    const picked = first.cover_photo_id == null
      ? null
      : db
          .prepare<[number, number], { id: number }>(
            `SELECT id FROM photo WHERE id = ? AND point_id = ?`,
          )
          .get(first.cover_photo_id, first.id)
    cover = picked?.id
      ?? db
        .prepare<[number], { id: number }>(
          `SELECT id FROM photo WHERE point_id = ? ORDER BY order_index LIMIT 1`,
        )
        .get(first.id)?.id
      ?? null
  }

  db.prepare<[number | null, number]>(`UPDATE post SET cover_photo_id = ? WHERE id = ?`).run(cover, postId)
  return cover
}

export function listPosts(includePrivate: boolean): PostSummary[] {
  const db = useDb()
  const posts = db
    .prepare<[], PostRow>(
      `SELECT * FROM post ${includePrivate ? '' : 'WHERE is_public = 1'} ORDER BY COALESCE(started_at, created_at) DESC`,
    )
    .all()

  return posts.map((p) => summarize(p))
}

function summarize(post: PostRow): PostSummary {
  const db = useDb()
  const points = db
    .prepare<[number], { lat: number; lng: number }>(
      `SELECT lat, lng FROM point WHERE post_id = ? ORDER BY order_index`,
    )
    .all(post.id)

  const photoCount = db
    .prepare<[number], { n: number }>(
      `SELECT COUNT(*) AS n FROM photo ph JOIN point pt ON pt.id = ph.point_id WHERE pt.post_id = ?`,
    )
    .get(post.id)?.n ?? 0

  const cover = post.cover_photo_id
    ? db
        .prepare<[number], Pick<PhotoRow, 'display_path' | 'thumb_path'>>(
          `SELECT display_path, thumb_path FROM photo WHERE id = ?`,
        )
        .get(post.cover_photo_id)
    : undefined

  // 지도 중심은 [lng, lat] — Mapbox 규약
  const center = points.length
    ? ([
        points.reduce((s, p) => s + p.lng, 0) / points.length,
        points.reduce((s, p) => s + p.lat, 0) / points.length,
      ] satisfies [number, number])
    : null

  return {
    ...post,
    is_public: post.is_public === 1,
    point_count: points.length,
    photo_count: photoCount,
    distance_km: routeKm(points),
    cover_thumb: cover ? PHOTO_URL + cover.thumb_path : null,
    cover_display: cover ? PHOTO_URL + cover.display_path : null,
    center,
  }
}

export function getPost(slug: string, includePrivate: boolean): PostDetail | null {
  const db = useDb()
  const post = db.prepare<[string], PostRow>(`SELECT * FROM post WHERE slug = ?`).get(slug)
  if (!post) return null
  if (!includePrivate && post.is_public !== 1) return null

  const points = db
    .prepare<[number], PointRow>(`SELECT * FROM point WHERE post_id = ? ORDER BY order_index`)
    .all(post.id)

  const photoStmt = db.prepare<[number], PhotoRow>(
    `SELECT * FROM photo WHERE point_id = ? ORDER BY order_index`,
  )

  return {
    ...summarize(post),
    points: points.map(({ post_id: _postId, tags, links, expenses, ...pt }) => ({
      ...pt,
      tags: parseTags(tags),
      links: parseLinks(links),
      expenses: parseExpenses(expenses),
      photos: photoStmt.all(pt.id).map(({ point_id: _pointId, ...ph }) => photoUrls({ ...ph, point_id: pt.id })),
    })),
  }
}
