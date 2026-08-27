/**
 * 포인트 구성 저장 — 편집 2단계 「포인트 편집」의 결과 전체를 한 번에 받는다.
 * 사진 이동 · 포인트 안 순서 · 새 포인트 분리 · 포인트 제거 · 사진 삭제가 모두 여기로 온다.
 *
 * 왜 한 엔드포인트인가:
 *   이 넷은 서로 얽혀 있다. 사진을 옮기면 옛 포인트가 비고, 빈 포인트는 사라져야 하고,
 *   포인트를 지우면 그 안 사진이 함께 지워지고, 지워진 사진이 커버였으면 커버가 옮겨간다.
 *   여러 요청으로 쪼개면 중간 상태(사진 0장 포인트 · 커버 없는 기록)가 DB 에 실제로 남고,
 *   한 요청이 실패하면 화면과 서버가 갈린다. 「구성 전체」를 통째로 받아 한 트랜잭션에 넣는다.
 *
 * 이 엔드포인트가 photos/reorder · photos/[id] DELETE 를 대신한다 (둘은 삭제했다).
 *
 * 🔴 클라이언트가 보낸 묶음이 이 기록의 사진 «전량»과 정확히 일치해야 한다.
 *    일부만 오면 언급되지 않은 사진의 소속·순서가 조용히 어긋난다.
 */
import type { PhotoRow, PointRow } from '#shared/types/db'
import { centroid } from '#shared/utils/cluster'

interface GroupInput {
  /** 기존 포인트 id. null 이면 「사진을 끌어내 새로 만든 포인트」다. */
  id: number | null
  /** 이 포인트에 담길 사진 id — 보이는 순서 그대로. 빈 배열은 허용하지 않는다. */
  photoIds: number[]
}

function bad(msg: string): never {
  throw createError({ statusCode: 400, statusMessage: msg })
}

function intArray(v: unknown, field: string): number[] {
  if (!Array.isArray(v)) bad(`${field}: 배열이어야 합니다`)
  const out: number[] = []
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isInteger(x) || x <= 0) bad(`${field}: 양의 정수 배열이어야 합니다`)
    out.push(x)
  }
  return out
}

function parseGroups(v: unknown): GroupInput[] {
  if (!Array.isArray(v) || !v.length) bad('groups: 포인트가 없습니다')
  return v.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) bad(`groups[${i}]: 객체여야 합니다`)
    const g = raw as Record<string, unknown>
    const id = g.id
    if (id !== null && (typeof id !== 'number' || !Number.isInteger(id) || id <= 0)) {
      bad(`groups[${i}].id: 정수이거나 null 이어야 합니다`)
    }
    const photoIds = intArray(g.photoIds, `groups[${i}].photoIds`)
    // 사진 0장 포인트는 지도에 좌표만 남은 유령이 된다 — 애초에 만들지 않는다
    if (!photoIds.length) bad(`groups[${i}].photoIds: 사진이 0장인 포인트는 만들 수 없습니다`)
    return { id: id as number | null, photoIds }
  })
}

export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const slug = getRouterParam(event, 'slug') ?? ''
  const raw: unknown = await readBody(event)
  if (typeof raw !== 'object' || raw === null) bad('본문이 비어 있습니다')
  const b = raw as Record<string, unknown>

  const groups = parseGroups(b.groups)
  const deleteIds = 'deletePhotoIds' in b && b.deletePhotoIds != null
    ? intArray(b.deletePhotoIds, 'deletePhotoIds')
    : []

  const db = useDb()
  const post = db
    .prepare<[string], { id: number }>(`SELECT id FROM post WHERE slug = ?`)
    .get(slug)
  if (!post) throw createError({ statusCode: 404, statusMessage: '기록을 찾을 수 없습니다' })

  const photos = db
    .prepare<[number], PhotoRow>(
      `SELECT ph.* FROM photo ph JOIN point pt ON pt.id = ph.point_id WHERE pt.post_id = ?`,
    )
    .all(post.id)
  const photoById = new Map(photos.map((p) => [p.id, p]))

  // ── 검증: 보낸 사진들이 이 기록의 사진 전량과 정확히 일치하는가 ──────────
  const seen = new Set<number>()
  const claim = (id: number, where: string) => {
    if (!photoById.has(id)) bad(`${where}: 이 기록의 사진이 아닙니다 (id ${id})`)
    if (seen.has(id)) bad(`${where}: 사진 id 가 중복됩니다 (id ${id})`)
    seen.add(id)
  }
  for (const [gi, g] of groups.entries()) for (const id of g.photoIds) claim(id, `groups[${gi}].photoIds`)
  for (const id of deleteIds) claim(id, 'deletePhotoIds')
  if (seen.size !== photoById.size) {
    bad(`사진 ${photoById.size}장 전부를 보내야 합니다 (받은 것 ${seen.size}장)`)
  }

  const points = db
    .prepare<[number], PointRow>(`SELECT * FROM point WHERE post_id = ?`)
    .all(post.id)
  const pointIds = new Set(points.map((p) => p.id))
  for (const [gi, g] of groups.entries()) {
    if (g.id !== null && !pointIds.has(g.id)) bad(`groups[${gi}].id: 이 기록의 포인트가 아닙니다 (id ${g.id})`)
  }
  if (new Set(groups.map((g) => g.id).filter((id) => id !== null)).size
    !== groups.filter((g) => g.id !== null).length) {
    bad('groups: 같은 포인트가 두 번 나옵니다')
  }

  const now = new Date().toISOString()

  const run = db.transaction(() => {
    // ── 1) 삭제할 사진 — 커버부터 옮기고 파일·행을 지운다 ──────────────────
    //    post.cover_photo_id 는 FK 라 참조 중인 행을 먼저 지우면 트랜잭션이 통째로 죽는다.
    if (deleteIds.length) {
      const survivors = groups.flatMap((g) => g.photoIds)
      const dead = new Set(deleteIds)

      const cover = db
        .prepare<[number], { cover_photo_id: number | null }>(`SELECT cover_photo_id FROM post WHERE id = ?`)
        .get(post.id)
      if (cover?.cover_photo_id != null && dead.has(cover.cover_photo_id)) {
        // 커버 규칙은 「첫 포인트의 첫 사진」이다 — 아래에서 순서를 다시 매기므로
        // 여기서는 일단 살아남는 사진 중 아무거나로 피신시키고, 끝에서 제자리를 잡아준다.
        db.prepare<[number | null, number]>(`UPDATE post SET cover_photo_id = ? WHERE id = ?`)
          .run(survivors[0] ?? null, post.id)
      }
      // 포인트 대표 썸네일은 FK 가 아니라 트랜잭션을 죽이지는 않지만, 지운 사진을
      // 가리킨 채 두면 「지정했는데 다른 게 뜬다」로 보인다. 그 자리에서 되돌린다.
      const clearThumb = db.prepare<[number]>(`UPDATE point SET cover_photo_id = NULL WHERE cover_photo_id = ?`)
      for (const id of deleteIds) clearThumb.run(id)

      const rows = deleteIds.map((id) => photoById.get(id)!)
      removePhotoFiles(rows.flatMap((r) => [r.display_path, r.thumb_path]))
      const dropPhoto = db.prepare<[number]>(`DELETE FROM photo WHERE id = ?`)
      for (const id of deleteIds) dropPhoto.run(id)
    }

    // ── 2) 새 포인트 — 앵커는 담긴 사진들의 centroid (clusterAt 과 같은 규칙) ──
    const insertPoint = db.prepare<[number, number, number, string | null, number]>(
      `INSERT INTO point (post_id, lat, lng, title, body, tags, first_shot_at, order_index)
       VALUES (?, ?, ?, NULL, NULL, '[]', ?, ?)`,
    )
    /** 그룹 순서대로의 확정 포인트 id */
    const resolved: number[] = []
    for (const g of groups) {
      if (g.id !== null) {
        resolved.push(g.id)
        continue
      }
      const shots = g.photoIds.map((id) => photoById.get(id)!)
      const c = centroid(shots)
      // shot_at 은 타임존 없는 고정 폭 문자열이라 사전순 비교가 곧 시각 순이다
      const first = shots.map((s) => s.shot_at).filter((t): t is string => t !== null).sort()[0] ?? null
      resolved.push(Number(insertPoint.run(post.id, c.lat, c.lng, first, 0).lastInsertRowid))
    }

    // ── 3) 사진 재배치 ────────────────────────────────────────────────────
    const movePhoto = db.prepare<[number, number, number]>(
      `UPDATE photo SET point_id = ?, order_index = ? WHERE id = ?`,
    )
    groups.forEach((g, gi) => {
      const pointId = resolved[gi]!
      g.photoIds.forEach((id, i) => movePhoto.run(pointId, i, id))
    })

    // ── 4) 비게 된 옛 포인트 제거 ─────────────────────────────────────────
    //    사진을 먼저 다 옮긴 뒤라야 한다 — photo.point_id 는 ON DELETE CASCADE 다.
    const keep = new Set(resolved)
    const dropPoint = db.prepare<[number]>(`DELETE FROM point WHERE id = ?`)
    let removedPoints = 0
    for (const p of points) {
      if (keep.has(p.id)) continue
      dropPoint.run(p.id)
      removedPoints++
    }

    // ── 5) first_shot_at 재계산 · 대표 썸네일 정리 ────────────────────────
    //    사진이 오가면 포인트의 대표 시각이 달라진다. 안 고치면 동선 순서가 옛 값에 묶인다.
    const syncFirstShot = db.prepare<[number, number]>(
      `UPDATE point
          SET first_shot_at = (SELECT MIN(shot_at) FROM photo WHERE point_id = ?)
        WHERE id = ?`,
    )
    // 다른 포인트로 가버린 사진을 대표로 붙들고 있으면 남의 사진이 뜬다
    const clearStrayThumb = db.prepare<[number, number]>(
      `UPDATE point SET cover_photo_id = NULL
        WHERE id = ? AND cover_photo_id IS NOT NULL
          AND cover_photo_id NOT IN (SELECT id FROM photo WHERE point_id = ?)`,
    )
    for (const id of resolved) {
      syncFirstShot.run(id, id)
      clearStrayThumb.run(id, id)
    }

    // ── 6) 포인트 순서는 촬영 시각 순 고정 ────────────────────────────────
    //    시각이 없는 포인트는 뒤로, 동률은 id 순 — 저장할 때마다 순서가 흔들리면 안 된다.
    const ordered = db
      .prepare<[number], { id: number }>(
        `SELECT id FROM point WHERE post_id = ?
          ORDER BY first_shot_at IS NULL, first_shot_at, id`,
      )
      .all(post.id)
    const setOrder = db.prepare<[number, number]>(`UPDATE point SET order_index = ? WHERE id = ?`)
    ordered.forEach((p, i) => setOrder.run(i, p.id))

    // ── 7) 커버 — 순서가 확정된 지금 다시 세운다 ──────────────────────────
    //    사진을 옮기면 첫 포인트가 통째로 바뀔 수 있어, 커버 사진이 살아 있어도 자리가 어긋난다.
    syncPostCover(post.id)
    db.prepare<[string, number]>(`UPDATE post SET updated_at = ? WHERE id = ?`).run(now, post.id)

    // 🔴 pointIds 는 보낸 groups 와 «같은 순서»다. 클라이언트는 이걸로
    //    새 포인트(id: null)의 서버 id 를 알아내 이름·태그·본문 PATCH 를 이어 보낸다.
    return { removedPhotos: deleteIds.length, removedPoints, pointIds: resolved }
  })

  return { ok: true, ...run() }
})
