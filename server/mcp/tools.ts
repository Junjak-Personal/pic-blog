import type Database from 'better-sqlite3'
import type { PostDetail, PostSummary } from '#shared/types/db'
import { editPost, postVersion } from '../utils/post-edit'
import { editPoint } from '../utils/point-edit'

const str = { type: 'string' }
const text = { type: ['string', 'null'] }
const version = { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'read_post 또는 list_posts 에서 받은 version' }
const base = (properties: object, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false })
export const MCP_TOOLS = [
  { name: 'list_posts', description: '비공개를 포함한 모든 기록 목록을 읽습니다.', inputSchema: base({}, []), annotations: { readOnlyHint: true } },
  { name: 'read_post', description: '기록·포인트·사진 메타데이터와 편집 버전을 읽습니다. 이미지 파일은 반환하지 않습니다.', inputSchema: base({ slug: str }, ['slug']), annotations: { readOnlyHint: true } },
  { name: 'update_post', description: '읽은 버전의 기록 제목·요약·기간을 고칩니다. 공개 전환·삭제는 불가능합니다.', inputSchema: base({ slug: str, version, title: str, summary: text, started_at: text, ended_at: text }, ['slug', 'version']), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
  { name: 'update_point', description: '읽은 기록 버전의 포인트 글을 고칩니다. 사진·그룹·좌표는 수정하지 않습니다.', inputSchema: base({ id: { type: 'integer', minimum: 1 }, version, title: text, body: text, tags: { type: 'array', items: str }, links: { type: 'array', items: base({ label: str, url: str }, ['url']) }, expenses: { type: 'array', items: base({ item: str, amount: { type: 'number' }, currency: str }, ['amount', 'currency']) } }, ['id', 'version']), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
]

interface Store {
  db: Database.Database
  list: () => PostSummary[]
  read: (slug: string) => PostDetail | null
}
const fields: Record<string, string[]> = {
  list_posts: [], read_post: ['slug'],
  update_post: ['slug', 'version', 'title', 'summary', 'started_at', 'ended_at'],
  update_point: ['id', 'version', 'title', 'body', 'tags', 'links', 'expenses'],
}

function input(name: string, raw: unknown) {
  if (!Object.hasOwn(fields, name)) throw new Error('알 수 없는 도구입니다')
  if (raw === undefined && name === 'list_posts') return {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('인자는 객체여야 합니다')
  const b = raw as Record<string, unknown>
  if (Object.keys(b).some((k) => !fields[name]!.includes(k))) throw new Error('이 도구에서 허용하지 않는 필드입니다')
  if (name !== 'list_posts' && name !== 'update_point' && (typeof b.slug !== 'string' || !b.slug || b.slug.length > 200)) throw new Error('slug 가 필요합니다')
  if (name === 'update_point' && (typeof b.id !== 'number' || !Number.isSafeInteger(b.id) || b.id <= 0)) throw new Error('올바른 포인트 id 가 필요합니다')
  if (name.startsWith('update_') && (typeof b.version !== 'string' || !/^[a-f0-9]{64}$/.test(b.version))) throw new Error('읽은 version 이 필요합니다')
  return b
}

/** Adapter boundary is shared by the HTTP route and isolated tests. */
export function callTool(store: Store, name: string, args: unknown) {
  const b = input(name, args)
  return store.db.transaction(() => {
    if (name === 'list_posts') return store.list().map((p) => ({ slug: p.slug, title: p.title, summary: p.summary, started_at: p.started_at, ended_at: p.ended_at, is_public: p.is_public, point_count: p.point_count, photo_count: p.photo_count, version: postVersion(store.db, p.id) }))
    if (name === 'read_post') {
      const p = store.read(b.slug as string)
      if (!p) throw new Error('기록을 찾을 수 없습니다')
      return {
        slug: p.slug, title: p.title, summary: p.summary, started_at: p.started_at, ended_at: p.ended_at, is_public: p.is_public,
        version: postVersion(store.db, p.id),
        points: p.points.map((pt) => ({ id: pt.id, order_index: pt.order_index, title: pt.title, body: pt.body, tags: pt.tags, links: pt.links, expenses: pt.expenses, first_shot_at: pt.first_shot_at,
          photos: pt.photos.map((ph) => ({ id: ph.id, shot_at: ph.shot_at, camera: ph.camera })) })),
      }
    }
    if (name === 'update_post') editPost(store.db, b.slug as string, b, b.version as string)
    else editPoint(store.db, b.id as number, b, b.version as string)
    const row = name === 'update_post'
      ? store.db.prepare<[string], { id: number }>('SELECT id FROM post WHERE slug = ?').get(b.slug as string)
      : store.db.prepare<[number], { id: number }>('SELECT post_id AS id FROM point WHERE id = ?').get(b.id as number)
    return { ok: true, version: postVersion(store.db, row!.id) }
  })()
}
