/**
 * 기록의 포인트를 다른 반경으로 다시 묶는다 (편집 1단계 「기록 설정」).
 *
 * 원래 설계는 포인트 앵커가 생성 후 불변이고 병합·분할은 업로드 반경으로만 갈렸다.
 * 이 엔드포인트는 그 규칙을 의도적으로 뒤집는 유일한 경로다 — 대신 파괴적이라는 걸
 * UI 가 먼저 알리고(사라질 포인트 이름을 나열), 여기서도 되돌릴 수 없음을 전제한다.
 *
 * 잃는 것: 포인트의 이름·태그·본문, 포인트 안 사진의 수동 정렬.
 * 지키는 것: 사진 파일과 행, EXIF 값, 그리고 post.cover_photo_id
 *           (커버는 사진을 가리키므로 포인트가 갈려도 살아남는다).
 *
 * 🔴 순서가 생명이다. photo.point_id 는 ON DELETE CASCADE 라
 *    옛 포인트를 먼저 지우면 사진이 통째로 딸려 지워진다.
 *    반드시 [새 포인트 생성 → 사진 재배치 → 빈 옛 포인트 삭제] 순으로 간다.
 */
import type { PhotoRow } from '#shared/types/db'
import { clusterAt, type ClusterInput } from '#shared/utils/cluster'
import { distanceM } from '#shared/utils/geo'
import { localIso } from '#shared/utils/format'

interface Shot extends ClusterInput {
  id: number
}

export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const slug = getRouterParam(event, 'slug') ?? ''
  const body = await readBody(event)
  const nextRadius = radius((body as Record<string, unknown> | null)?.radius)

  const db = useDb()
  const found = db
    .prepare<[string], { id: number; slug: string }>(`SELECT id, slug FROM post WHERE slug = ?`)
    .get(slug)
  if (!found) throw createError({ statusCode: 404, statusMessage: '기록을 찾을 수 없습니다' })
  const post = found

  // 촬영 시각이 없는 사진은 클러스터링에 못 넣는다 — 업로드 때 이미 걸러졌지만 한 번 더 본다.
  const photos = db
    .prepare<[number], PhotoRow>(
      `SELECT ph.* FROM photo ph
       JOIN point pt ON pt.id = ph.point_id
       WHERE pt.post_id = ?
       ORDER BY ph.shot_at`,
    )
    .all(post.id)

  const shots: Shot[] = []
  /** 촬영 시각이 없어 클러스터링에 못 들어가는 사진들. 버려두면 아래에서 CASCADE 로
      같이 지워지므로(= 조용한 사진 소실) 가장 가까운 새 포인트에 붙인다. */
  const orphans: PhotoRow[] = []
  for (const p of photos) {
    if (p.shot_at) shots.push({ id: p.id, key: String(p.id), lat: p.lat, lng: p.lng, t: Date.parse(p.shot_at) })
    else orphans.push(p)
  }

  if (!shots.length) {
    throw createError({ statusCode: 400, statusMessage: '촬영 시각이 있는 사진이 없어 다시 묶을 수 없습니다' })
  }

  // 업로드 때와 똑같은 알고리즘. 클라이언트가 보낸 묶음은 믿지 않고 여기서 다시 계산한다.
  const clusters = clusterAt(shots, nextRadius)

  const run = db.transaction(() => {
    const oldPointIds = db
      .prepare<[number], { id: number }>(`SELECT id FROM point WHERE post_id = ?`)
      .all(post.id)
      .map((r) => r.id)

    const insertPoint = db.prepare<[number, number, number, string | null, number]>(
      `INSERT INTO point (post_id, lat, lng, title, body, tags, first_shot_at, order_index)
       VALUES (?, ?, ?, NULL, NULL, '[]', ?, ?)`,
    )
    const movePhoto = db.prepare<[number, number, number]>(
      `UPDATE photo SET point_id = ?, order_index = ? WHERE id = ?`,
    )

    const newPoints: { id: number; lat: number; lng: number; count: number }[] = []

    clusters.forEach((c, ci) => {
      const first = c.shots[0]
      const pointId = Number(
        insertPoint.run(
          post.id,
          c.lat,
          c.lng,
          // 🔴 toISOString() 을 쓰면 안 된다 — shot_at 은 타임존 없는 벽시계 값이라
          //    UTC 로 돌면서 시각이 통째로 밀린다 (09:00 → 00:00).
          first ? localIso(first.t) : null,
          ci,
        ).lastInsertRowid,
      )
      // 포인트 안 순서는 촬영 시각 순으로 되돌아간다 — 수동 정렬은 여기서 사라진다.
      c.shots.forEach((s, si) => movePhoto.run(pointId, si, s.id))
      newPoints.push({ id: pointId, lat: c.lat, lng: c.lng, count: c.shots.length })
    })

    // 시각 없는 사진은 좌표로 가장 가까운 포인트에 붙인다. 어디든 붙어야 살아남는다.
    for (const o of orphans) {
      // distanceM 은 [lat, lng] 순서다 (geo.ts). 뒤집으면 엉뚱한 포인트에 붙는다.
      let best = newPoints[0]!
      let bestD = distanceM([o.lat, o.lng], [best.lat, best.lng])
      for (const np of newPoints) {
        const d = distanceM([o.lat, o.lng], [np.lat, np.lng])
        if (d < bestD) { best = np; bestD = d }
      }
      movePhoto.run(best.id, best.count++, o.id)
    }

    // 이제 옛 포인트에는 사진이 없다. 여기서 지워야 CASCADE 가 사진을 건드리지 않는다.
    const dropPoint = db.prepare<[number]>(`DELETE FROM point WHERE id = ?`)
    for (const id of oldPointIds) dropPoint.run(id)

    db.prepare<[number, string, number]>(
      `UPDATE post SET cluster_radius = ?, updated_at = ? WHERE id = ?`,
    ).run(nextRadius, new Date().toISOString(), post.id)
  })

  run()

  return getPost(post.slug, true)
})
