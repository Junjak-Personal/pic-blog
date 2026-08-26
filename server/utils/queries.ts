import type { PhotoRow, PointRow, PostDetail, PostRow, PostSummary } from '#shared/types/db'
import { distanceKm } from '#shared/utils/geo'
import { parseTags } from '#shared/utils/format'

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
    points: points.map(({ post_id: _postId, tags, ...pt }) => ({
      ...pt,
      tags: parseTags(tags),
      photos: photoStmt.all(pt.id).map(({ point_id: _pointId, ...ph }) => photoUrls({ ...ph, point_id: pt.id })),
    })),
  }
}
