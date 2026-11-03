import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA } from '../utils/db'
import { getPost, listPosts, syncPostCover, fillPointCovers } from '../utils/queries'
import { callTool, MCP_TOOLS } from './tools'
import { postVersion } from '../utils/post-edit'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  db.exec(`INSERT INTO post(id,slug,title,is_public,created_at,updated_at) VALUES (1,'private','private title',0,'now','now'),(2,'other','other title',1,'now','now');
    INSERT INTO point(id,post_id,lat,lng,order_index) VALUES (11,1,37,127,0),(22,2,38,128,0);
    INSERT INTO photo(id,point_id,display_path,thumb_path,w,h,lat,lng,order_index) VALUES (101,11,'private/a.jpg','private/t.jpg',400,300,37,127,0),(202,22,'other/a.jpg','other/t.jpg',400,300,38,128,0);`)
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
  vi.stubGlobal('useDb', () => db)
  vi.stubGlobal('syncPostCover', syncPostCover)
  vi.stubGlobal('fillPointCovers', fillPointCovers)
})
afterEach(() => { db.close(); vi.unstubAllGlobals() })
const call = (name: string, args: unknown = {}) => callTool({ db, list: () => listPosts(true), read: (slug) => getPost(slug, true) }, name, args)

describe('Picblog MCP tool boundary', () => {
  it('exposes only four planned tools and includes private status without image URLs/coordinates', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(['list_posts', 'read_post', 'update_post', 'update_point'])
    expect(call('list_posts')).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'private', is_public: false })]))
    const content = JSON.stringify(call('read_post', { slug: 'private' }))
    expect(content).toContain('private title')
    expect(content).not.toContain('private/a.jpg')
    expect(content).not.toContain('"lat"')
  })
  it('writes use the current full-content version and reject stale edits atomically', () => {
    const version = postVersion(db, 1)
    call('update_point', { id: 11, version, title: '새 제목' })
    expect(db.prepare('SELECT title FROM point WHERE id = 11').get()).toEqual({ title: '새 제목' })
    expect(() => call('update_post', { slug: 'private', version, title: 'stale overwrite' })).toThrow('다시 읽고')
    expect(db.prepare('SELECT title FROM post WHERE id = 1').get()).toEqual({ title: 'private title' })
  })
  it('same timestamp photo/group changes invalidate revisions; another post revision cannot edit this post', () => {
    const version = postVersion(db, 1)
    db.prepare('UPDATE photo SET camera = ? WHERE id = 101').run('edited')
    expect(() => call('update_point', { id: 11, version, title: 'stale' })).toThrow('다시 읽고')
    expect(() => call('update_point', { id: 22, version: postVersion(db, 1), title: 'wrong post' })).toThrow('다시 읽고')
  })
  it('rejects publication, deletion, photo reassignment and unsafe links without partial writes', () => {
    const version = postVersion(db, 1)
    expect(() => call('update_post', { slug: 'private', version, is_public: true })).toThrow('허용하지 않는')
    expect(() => call('delete_post', { slug: 'private' })).toThrow('알 수 없는')
    expect(() => call('update_point', { id: 11, version, cover_photo_id: 202 })).toThrow('허용하지 않는')
    expect(() => call('update_point', { id: 11, version, title: 'partial', links: [{ url: 'javascript:alert(1)' }] })).toThrow('http 또는 https')
    expect(db.prepare('SELECT title FROM point WHERE id = 11').get()).toEqual({ title: null })
  })
  it('retains shared web validation for title, tags, periods and expenses', () => {
    const version = postVersion(db, 1)
    expect(() => call('update_post', { slug: 'private', version, title: '' })).toThrow('비어')
    expect(() => call('update_post', { slug: 'private', version, started_at: '2026-11-02T00:00:00', ended_at: '2026-11-01T00:00:00' })).toThrow('시작이 종료보다')
    expect(() => call('update_point', { id: 11, version, tags: [42] })).toThrow('문자열')
    expect(() => call('update_point', { id: 11, version, expenses: [{ amount: -1, currency: 'KRW' }] })).toThrow('0보다')
    call('update_point', { id: 11, version, tags: [' a ', 'a'], links: [{ url: 'https://example.com' }] })
    expect(db.prepare('SELECT tags FROM point WHERE id = 11').get()).toEqual({ tags: '["a"]' })
  })
})
