import type Database from 'better-sqlite3'

/** 촬영 시각에서 slug 를 뽑는다. 타이틀은 나중에 편집되지만 slug 는 링크 안정성 때문에 고정한다. */
export function uniqueSlug(db: Database.Database, isoDate: string) {
  const base = `record-${(isoDate.split('T')[0] ?? '').replaceAll('-', '')}` || 'record'
  const taken = db.prepare<[string, string], { slug: string }>(
    `SELECT slug FROM post WHERE slug = ? OR slug LIKE ? || '-%'`,
  )
  const rows = taken.all(base, base).map((r) => r.slug)
  if (!rows.includes(base)) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!rows.includes(candidate)) return candidate
  }
  throw createError({ statusCode: 500, statusMessage: 'slug 를 만들 수 없습니다' })
}
