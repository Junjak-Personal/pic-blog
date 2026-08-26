import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'

let handle: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS post (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  summary        TEXT,
  cover_photo_id INTEGER REFERENCES photo(id),
  started_at     TEXT,
  ended_at       TEXT,
  is_public      INTEGER NOT NULL DEFAULT 0,
  -- 이 기록을 묶을 때 쓴 클러스터 반경(m). 편집 화면에서 「현재 50m」 를 보여주고
  -- 재클러스터링 기준으로 쓴다. 업로드 이전 기록은 NULL 이다.
  cluster_radius INTEGER,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS point (
  id            INTEGER PRIMARY KEY,
  post_id       INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  title         TEXT,
  body          TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',
  first_shot_at TEXT,
  order_index   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photo (
  id           INTEGER PRIMARY KEY,
  point_id     INTEGER NOT NULL REFERENCES point(id) ON DELETE CASCADE,
  display_path TEXT NOT NULL,
  thumb_path   TEXT NOT NULL,
  w            INTEGER NOT NULL,
  h            INTEGER NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  shot_at      TEXT,
  camera       TEXT,
  f_number     REAL,
  exposure     TEXT,
  iso          INTEGER,
  order_index  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_point_post  ON point(post_id, order_index);
CREATE INDEX IF NOT EXISTS idx_photo_point ON photo(point_id, order_index);
`

export function dataDir() {
  return resolve(useRuntimeConfig().dataDir)
}

export function photosDir() {
  return join(dataDir(), 'photos')
}

/**
 * 이미 만들어진 테이블에 열을 더한다.
 * CREATE TABLE IF NOT EXISTS 는 기존 테이블을 손대지 않으므로, 스키마에 열을 추가해도
 * 운영 DB 에는 반영되지 않는다. 여기서 한 번 더 맞춘다 — 있으면 아무 일도 하지 않는다.
 */
function addColumnIfMissing(db: Database.Database, table: string, column: string, decl: string) {
  const cols = db.prepare<[], { name: string }>(`PRAGMA table_info(${table})`).all()
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`)
  }
}

export function useDb() {
  if (handle) return handle

  const dir = dataDir()
  mkdirSync(dir, { recursive: true })
  mkdirSync(photosDir(), { recursive: true })

  const db = new Database(join(dir, 'pic-blog.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  addColumnIfMissing(db, 'post', 'cluster_radius', 'INTEGER')

  handle = db
  return db
}
