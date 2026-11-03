import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { PhotoRow, PointRow, PostRow } from '../../shared/types/db'
import type { PhotoAiGroup, PhotoAiProposal, PhotoAiRequest } from '../../shared/types/photo-ai'
import { fail, parseRequest, PhotoAiError, protectedIds, snapshotHash, validateGroups, type PhotoSnapshot } from './plan'
import type { AiProvider } from './provider'

export const AI_SCHEMA = `
CREATE TABLE IF NOT EXISTS photo_ai_request (
  id TEXT PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','ready','applied','failed','cancelled','undone')),
  request_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  applied_hash TEXT,
  groups_json TEXT,
  error TEXT,
  model TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS photo_ai_attempt (
  request_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (request_id, attempt)
);
CREATE INDEX IF NOT EXISTS idx_photo_ai_post ON photo_ai_request(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_photo_ai_attempt_day ON photo_ai_attempt(started_at);
`
type Status = PhotoAiProposal['status']
interface RequestRow {
  id: string; post_id: number; fingerprint: string; status: Status
  request_json: string; snapshot_json: string; source_hash: string; applied_hash: string | null
  groups_json: string | null; error: string | null; model: string; attempts: number
  input_tokens: number; output_tokens: number; created_at: string; updated_at: string
}
const active = new Map<string, AbortController>()
const now = () => new Date().toISOString()

export function loadSnapshot(db: Database.Database, slug: string): PhotoSnapshot {
  const post = db.prepare<[string], PostRow>('SELECT * FROM post WHERE slug = ?').get(slug)
  if (!post) fail(404, '기록을 찾을 수 없습니다')
  const points = db.prepare<[number], PointRow>('SELECT * FROM point WHERE post_id = ? ORDER BY id').all(post.id)
  const photos = db.prepare<[number], PhotoRow>('SELECT ph.* FROM photo ph JOIN point pt ON pt.id = ph.point_id WHERE pt.post_id = ? ORDER BY ph.id').all(post.id)
  return { post, points, photos }
}

function publicProposal(row: RequestRow): PhotoAiProposal {
  const request = JSON.parse(row.request_json) as PhotoAiRequest
  const base = { id: row.id, createdAt: row.created_at, protectedPointIds: request.protectedPointIds, sendImages: request.sendImages,
    usage: { inputTokens: row.input_tokens, outputTokens: row.output_tokens, attempts: row.attempts } }
  if (row.status === 'pending') return { ...base, status: 'pending', groups: [], message: null }
  if (row.status === 'cancelled' || row.status === 'failed') return { ...base, status: row.status, groups: [], message: row.error ?? '요청이 취소되었습니다' }
  return { ...base, status: row.status, groups: JSON.parse(row.groups_json ?? '[]') as PhotoAiGroup[], message: null }
}

export class PhotoAiService {
  constructor(private db: Database.Database, private model: string, private dailyLimit = 20) {
    db.exec(AI_SCHEMA)
  }

  private row(slug: string, id: string) {
    this.expireStale()
    const row = this.db.prepare<[string,string], RequestRow>('SELECT r.* FROM photo_ai_request r JOIN post p ON p.id = r.post_id WHERE r.id = ? AND p.slug = ?').get(id, slug)
    if (!row) fail(404, 'AI 제안을 찾을 수 없습니다')
    return row
  }

  private expireStale() {
    // A crashed process never leaves an immortal pending request; attempts are still charged.
    this.db.prepare('UPDATE photo_ai_request SET status = ?, error = ?, updated_at = ? WHERE status = ? AND updated_at < ?')
      .run('failed', '처리가 중단되었습니다. 한 번 더 시도할 수 있습니다', now(), 'pending', new Date(Date.now()-65_000).toISOString())
  }

  get(slug: string, id: string) { return publicProposal(this.row(slug, id)) }

  async propose(slug: string, raw: unknown, provider: AiProvider) {
    const start = this.db.transaction(() => {
      this.expireStale()
      const snapshot = loadSnapshot(this.db, slug)
      if (!snapshot.photos.length || snapshot.photos.length > 40) fail(400, 'AI 정리는 사진 1~40장인 기록에서 사용할 수 있습니다')
      const request = parseRequest(raw, snapshot)
      request.protectedPointIds = protectedIds(snapshot, request.protectedPointIds)
      if (snapshot.points.every(p => request.protectedPointIds.includes(p.id))) fail(400, '모든 그룹이 보호되어 있습니다. 빈 제목의 그룹을 선택해 주세요')
      const sourceHash = snapshotHash(snapshot)
      const fingerprint = createHash('sha256').update(JSON.stringify({ sourceHash, context: request.context, sendImages: request.sendImages, protected: request.protectedPointIds, model: this.model })).digest('hex')
      const byId = this.db.prepare<[string], RequestRow>('SELECT * FROM photo_ai_request WHERE id = ?').get(request.requestId)
      if (byId && byId.fingerprint !== fingerprint) fail(409, '요청 ID가 다른 내용에 사용되었습니다. 새 요청을 시작해 주세요')
      const existing = byId ?? this.db.prepare<[string], RequestRow>('SELECT * FROM photo_ai_request WHERE fingerprint = ?').get(fingerprint)
      if (existing && (!['failed','cancelled'].includes(existing.status) || existing.attempts >= 2)) return { row: existing, run: false, snapshot, request }
      const pending = this.db.prepare<[number], { id: string }>('SELECT id FROM photo_ai_request WHERE post_id = ? AND status = \'pending\'').get(snapshot.post.id)
      if (pending) fail(409, '이 기록의 다른 AI 요청이 진행 중입니다')
      const used = this.db.prepare<[string], { n: number }>('SELECT COUNT(*) AS n FROM photo_ai_attempt WHERE started_at >= ?').get(new Date().toISOString().slice(0,10))?.n ?? 0
      const limit = Number.isFinite(this.dailyLimit) ? Math.max(1, Math.min(20, Math.floor(this.dailyLimit))) : 20
      if (used >= limit) fail(429, '오늘의 AI 요청 한도에 도달했습니다')
      const time = now()
      const id = existing?.id ?? request.requestId
      const attempts = (existing?.attempts ?? 0) + 1
      if (existing) this.db.prepare('UPDATE photo_ai_request SET status = \'pending\', attempts = ?, error = NULL, updated_at = ? WHERE id = ?').run(attempts,time,id)
      else this.db.prepare(`INSERT INTO photo_ai_request (id,post_id,fingerprint,status,request_json,snapshot_json,source_hash,model,attempts,created_at,updated_at) VALUES (?,?,?,'pending',?,?,?,?,?,?,?)`)
        .run(id,snapshot.post.id,fingerprint,JSON.stringify(request),JSON.stringify(snapshot),sourceHash,this.model,attempts,time,time)
      this.db.prepare('INSERT INTO photo_ai_attempt (request_id,attempt,started_at) VALUES (?,?,?)').run(id,attempts,time)
      return { row: this.row(slug,id), run: true, snapshot, request }
    }).immediate()
    if (!start.run) return publicProposal(start.row)
    const controller = new AbortController()
    active.set(start.row.id,controller)
    const timer = setTimeout(() => controller.abort(),45_000)
    try {
      const result = await provider(start.snapshot,start.request,controller.signal)
      this.db.prepare('UPDATE photo_ai_request SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE id = ?').run(result.inputTokens,result.outputTokens,start.row.id)
      if (controller.signal.aborted) fail(504, 'AI 요청 시간이 초과되었거나 취소되었습니다')
      const groups = validateGroups(result.result,start.snapshot,start.request.protectedPointIds)
      this.db.prepare('UPDATE photo_ai_request SET status = \'ready\', groups_json = ?, updated_at = ? WHERE id = ? AND status = \'pending\' AND attempts = ?')
        .run(JSON.stringify(groups),now(),start.row.id,start.row.attempts)
    } catch (error) {
      const message = error instanceof PhotoAiError ? error.message : 'AI 처리에 실패했습니다. 한 번 더 시도할 수 있습니다'
      this.db.prepare('UPDATE photo_ai_request SET status = \'failed\', error = ?, updated_at = ? WHERE id = ? AND status = \'pending\' AND attempts = ?').run(message,now(),start.row.id,start.row.attempts)
    } finally { clearTimeout(timer); if (active.get(start.row.id) === controller) active.delete(start.row.id) }
    return this.get(slug,start.row.id)
  }

  cancel(slug: string, id: string) {
    const row = this.row(slug,id)
    if (!['pending','ready','failed','cancelled'].includes(row.status)) fail(409, '이미 적용한 제안은 되돌리기를 사용해 주세요')
    this.db.prepare('UPDATE photo_ai_request SET status = \'cancelled\', error = ?, updated_at = ? WHERE id = ? AND status IN (\'pending\',\'ready\',\'failed\')')
      .run('요청을 취소했습니다. 이미 전송한 요청의 비용은 발생할 수 있습니다',now(),id)
    active.get(id)?.abort()
    return this.get(slug,id)
  }

  apply(slug: string, id: string) {
    return this.db.transaction(() => {
      const row = this.row(slug,id)
      if (row.status === 'applied') return publicProposal(row)
      if (row.status !== 'ready') fail(409, '검토할 수 있는 AI 제안이 아닙니다')
      const current = loadSnapshot(this.db,slug)
      if (snapshotHash(current) !== row.source_hash) fail(409, '기록이 변경되었습니다. 새 AI 제안을 만들어 주세요')
      const request = JSON.parse(row.request_json) as PhotoAiRequest
      const groups = JSON.parse(row.groups_json ?? '[]') as PhotoAiGroup[]
      // Validate again at mutation boundary, including the full original protected partition.
      const flexible = groups.filter(g => g.pointId === null || !request.protectedPointIds.includes(g.pointId))
      const validated = validateGroups({ groups: flexible },current,request.protectedPointIds)
      const retained = new Set<number>()
      for (const group of validated) {
        const protectedGroup = group.pointId !== null && request.protectedPointIds.includes(group.pointId)
        let pointId = group.pointId
        if (protectedGroup && pointId !== null) { retained.add(pointId); continue }
        const photos = group.photoIds.map(id => current.photos.find(p => p.id === id)!)
        const first = [...photos].sort((a,b) => (a.shot_at === null ? 1 : 0)-(b.shot_at === null ? 1 : 0) || (a.shot_at ?? '').localeCompare(b.shot_at ?? '') || a.id-b.id)[0]!
        if (pointId === null) {
          pointId = Number(this.db.prepare('INSERT INTO point (post_id,lat,lng,title,first_shot_at,order_index,cover_photo_id) VALUES (?,?,?,?,?,0,?)')
            .run(current.post.id,first.lat,first.lng,group.title,first.shot_at,first.id).lastInsertRowid)
        } else {
          this.db.prepare('UPDATE point SET title = ?, lat = ?, lng = ?, first_shot_at = ?, cover_photo_id = ? WHERE id = ? AND post_id = ?')
            .run(group.title,first.lat,first.lng,first.shot_at,first.id,pointId,current.post.id)
        }
        retained.add(pointId)
        group.photoIds.forEach((photoId,index) => this.db.prepare('UPDATE photo SET point_id = ?, order_index = ? WHERE id = ?').run(pointId,index,photoId))
      }
      for (const point of current.points) if (!retained.has(point.id)) this.db.prepare('DELETE FROM point WHERE id = ? AND post_id = ?').run(point.id,current.post.id)
      const ordered = this.db.prepare<[number], {id:number}>('SELECT id FROM point WHERE post_id = ? ORDER BY first_shot_at IS NULL, first_shot_at, id').all(current.post.id)
      ordered.forEach((point,index) => this.db.prepare('UPDATE point SET order_index = ? WHERE id = ?').run(index,point.id))
      this.touch(current.post.id)
      this.db.prepare('UPDATE photo_ai_request SET status = \'applied\', applied_hash = ?, updated_at = ? WHERE id = ?').run(snapshotHash(loadSnapshot(this.db,slug)),now(),id)
      return this.get(slug,id)
    }).immediate()
  }

  undo(slug: string, id: string) {
    return this.db.transaction(() => {
      const row = this.row(slug,id)
      if (row.status === 'undone') return publicProposal(row)
      if (row.status !== 'applied') fail(409, '적용한 AI 제안만 되돌릴 수 있습니다')
      const current = loadSnapshot(this.db,slug)
      if (snapshotHash(current) !== row.applied_hash) fail(409, '적용 후 기록이 변경되어 되돌릴 수 없습니다')
      const original = JSON.parse(row.snapshot_json) as PhotoSnapshot
      const keep = new Set(original.points.map(p => p.id))
      for (const point of original.points) {
        const occupant = this.db.prepare<[number], {post_id:number}>('SELECT post_id FROM point WHERE id = ?').get(point.id)
        if (occupant && occupant.post_id !== original.post.id) fail(409, '원래 포인트 번호가 사용 중이어서 되돌릴 수 없습니다')
        this.db.prepare(`INSERT INTO point (id,post_id,lat,lng,title,body,tags,first_shot_at,order_index,cover_photo_id,links,expenses)
          VALUES (@id,@post_id,@lat,@lng,@title,@body,@tags,@first_shot_at,@order_index,@cover_photo_id,@links,@expenses)
          ON CONFLICT(id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,title=excluded.title,body=excluded.body,tags=excluded.tags,first_shot_at=excluded.first_shot_at,order_index=excluded.order_index,cover_photo_id=excluded.cover_photo_id,links=excluded.links,expenses=excluded.expenses`).run(point)
      }
      for (const photo of original.photos) this.db.prepare('UPDATE photo SET point_id = ?, order_index = ? WHERE id = ?').run(photo.point_id,photo.order_index,photo.id)
      for (const point of current.points) if (!keep.has(point.id)) this.db.prepare('DELETE FROM point WHERE id = ?').run(point.id)
      this.db.prepare('UPDATE post SET cover_photo_id = ? WHERE id = ?').run(original.post.cover_photo_id,original.post.id)
      this.touch(original.post.id)
      this.db.prepare('UPDATE photo_ai_request SET status = \'undone\', updated_at = ? WHERE id = ?').run(now(),id)
      return this.get(slug,id)
    }).immediate()
  }

  private touch(postId: number) {
    this.db.prepare('UPDATE post SET updated_at = ? WHERE id = ?').run(now(),postId)
  }
}
