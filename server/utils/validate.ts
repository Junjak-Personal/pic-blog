/**
 * 신뢰 경계 검증 — 업로드 매니페스트는 클라이언트가 만든다. 통째로 믿지 않는다.
 * 스키마 라이브러리를 새로 넣을 만큼 형태가 크지 않아 손으로 좁힌다.
 */
import type { AddPhotosInput, CreatePostInput, UploadPhotoInput, UploadPointInput } from '#shared/types/upload'

const EXTS = new Set(['webp', 'jpeg'])
const MAX_POINTS = 2000
const MAX_PHOTOS_PER_POINT = 2000

function bad(msg: string): never {
  throw createError({ statusCode: 400, statusMessage: msg })
}

function str(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string') bad(`${field}: 문자열이어야 합니다`)
  const s = v.trim()
  if (!s) bad(`${field}: 비어 있습니다`)
  if (s.length > max) bad(`${field}: ${max}자를 넘습니다`)
  return s
}

function nullableStr(v: unknown, field: string, max: number): string | null {
  if (v == null) return null
  if (typeof v !== 'string') bad(`${field}: 문자열이어야 합니다`)
  const s = v.trim()
  if (!s) return null
  if (s.length > max) bad(`${field}: ${max}자를 넘습니다`)
  return s
}

function nullableNum(v: unknown, field: string): number | null {
  if (v == null) return null
  if (typeof v !== 'number' || !isFinite(v)) bad(`${field}: 숫자여야 합니다`)
  return v
}

function nullableInt(v: unknown, field: string): number | null {
  const n = nullableNum(v, field)
  return n == null ? null : Math.round(n)
}

function coord(v: unknown, field: string, limit: number): number {
  if (typeof v !== 'number' || !isFinite(v)) bad(`${field}: 좌표가 숫자가 아닙니다`)
  if (v < -limit || v > limit) bad(`${field}: 좌표 범위를 벗어났습니다 (${v})`)
  return v
}

function ext(v: unknown, field: string): string {
  if (typeof v !== 'string' || !EXTS.has(v)) bad(`${field}: webp 또는 jpeg 여야 합니다`)
  return v
}

/** ISO8601 로컬 시각 — 'YYYY-MM-DDTHH:mm:ss'. 타임존 접미사는 붙지 않는다. */
function isoOrNull(v: unknown, field: string): string | null {
  if (v == null) return null
  if (typeof v !== 'string') bad(`${field}: 시각 형식이 잘못됐습니다`)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) bad(`${field}: 시각 형식이 잘못됐습니다 (${v})`)
  return v
}

function photo(raw: unknown, at: string): UploadPhotoInput {
  if (typeof raw !== 'object' || raw === null) bad(`${at}: 사진 객체가 아닙니다`)
  const p = raw as Record<string, unknown>
  return {
    key: str(p.key, `${at}.key`, 300),
    displayExt: ext(p.displayExt, `${at}.displayExt`),
    thumbExt: ext(p.thumbExt, `${at}.thumbExt`),
    lat: coord(p.lat, `${at}.lat`, 90),
    lng: coord(p.lng, `${at}.lng`, 180),
    shot_at: isoOrNull(p.shot_at, `${at}.shot_at`),
    camera: nullableStr(p.camera, `${at}.camera`, 120),
    f_number: nullableNum(p.f_number, `${at}.f_number`),
    exposure: nullableStr(p.exposure, `${at}.exposure`, 40),
    iso: nullableInt(p.iso, `${at}.iso`),
  }
}

function point(raw: unknown, at: string): UploadPointInput {
  if (typeof raw !== 'object' || raw === null) bad(`${at}: 포인트 객체가 아닙니다`)
  const p = raw as Record<string, unknown>
  if (!Array.isArray(p.photos) || !p.photos.length) bad(`${at}.photos: 사진이 없는 포인트는 만들 수 없습니다`)
  if (p.photos.length > MAX_PHOTOS_PER_POINT) bad(`${at}.photos: 너무 많습니다`)
  return {
    lat: coord(p.lat, `${at}.lat`, 90),
    lng: coord(p.lng, `${at}.lng`, 180),
    title: nullableStr(p.title, `${at}.title`, 200),
    first_shot_at: isoOrNull(p.first_shot_at, `${at}.first_shot_at`),
    photos: p.photos.map((x, i) => photo(x, `${at}.photos[${i}]`)),
  }
}

function points(raw: unknown, at: string): UploadPointInput[] {
  if (!Array.isArray(raw) || !raw.length) bad(`${at}: 포인트가 없습니다`)
  if (raw.length > MAX_POINTS) bad(`${at}: 포인트가 너무 많습니다`)
  return raw.map((x, i) => point(x, `${at}[${i}]`))
}

export function validateCreatePost(raw: unknown): CreatePostInput {
  if (typeof raw !== 'object' || raw === null) bad('본문이 비어 있습니다')
  const b = raw as Record<string, unknown>
  return { title: str(b.title, 'title', 200), points: points(b.points, 'points') }
}

export function validateAddPhotos(raw: unknown): AddPhotosInput {
  if (typeof raw !== 'object' || raw === null) bad('본문이 비어 있습니다')
  const b = raw as Record<string, unknown>
  const joinsRaw = Array.isArray(b.joins) ? b.joins : []
  const newsRaw = Array.isArray(b.news) ? b.news : []
  if (!joinsRaw.length && !newsRaw.length) bad('추가할 사진이 없습니다')

  const joins = joinsRaw.map((x, i) => {
    const at = `joins[${i}]`
    if (typeof x !== 'object' || x === null) bad(`${at}: 객체가 아닙니다`)
    const j = x as Record<string, unknown>
    if (typeof j.pointId !== 'number' || !Number.isInteger(j.pointId)) bad(`${at}.pointId: 정수여야 합니다`)
    if (!Array.isArray(j.photos) || !j.photos.length) bad(`${at}.photos: 비어 있습니다`)
    return { pointId: j.pointId, photos: j.photos.map((p, k) => photo(p, `${at}.photos[${k}]`)) }
  })

  return { joins, news: newsRaw.map((x, i) => point(x, `news[${i}]`)) }
}
