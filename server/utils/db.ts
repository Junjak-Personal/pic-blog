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

export function useDb() {
  if (handle) return handle

  const dir = dataDir()
  mkdirSync(dir, { recursive: true })
  mkdirSync(photosDir(), { recursive: true })

  const db = new Database(join(dir, 'pic-blog.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  handle = db
  return db
}
