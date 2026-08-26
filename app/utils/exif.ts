/**
 * 업로드 1단계 — 파일에서 EXIF 를 뽑고 GPS 없는 사진을 걸러낸다.
 * 전부 클라이언트에서 돈다. 서버는 바이트를 디스크에 쓰기만 한다 (설계문서 §5).
 */
import exifr from 'exifr'

export interface ScannedPhoto {
  /** 업로드 세션 내 고유 키 — 파일명은 중복될 수 있다 */
  key: string
  file: File
  name: string
  lat: number
  lng: number
  /** epoch ms — 정렬 키 */
  t: number
  /** ISO8601 로컬 시각 (타임존 없음 — EXIF DateTimeOriginal 은 타임존을 안 준다) */
  shotAt: string
  camera: string | null
  fNumber: number | null
  exposure: string | null
  iso: number | null
}

export interface SkippedPhoto {
  name: string
  reason: 'no-gps' | 'exif-error'
}

export interface ScanResult {
  passed: ScannedPhoto[]
  skipped: SkippedPhoto[]
}

/** exifr 은 외부 라이브러리라 반환 타입이 통제 밖이다 — 경계에서 즉시 좁힌다. */
interface RawExif {
  DateTimeOriginal?: unknown
  Make?: unknown
  Model?: unknown
  FNumber?: unknown
  ExposureTime?: unknown
  ISO?: unknown
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** EXIF 는 타임존 없는 로컬 시각이다. Date 로 파싱된 값을 그 벽시계 그대로 ISO 문자열로 되돌린다. */
function toLocalIso(d: Date) {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 아트보드 1b 는 「iPhone 15 Pro」로 쓴다 — Make 를 앞에 붙이지 않는다. */
function cameraName(make: string | null, model: string | null) {
  return model ?? make
}

async function scanOne(file: File, index: number): Promise<ScannedPhoto | SkippedPhoto> {
  let gps: { latitude: number; longitude: number } | undefined
  let raw: RawExif = {}

  try {
    gps = await exifr.gps(file)
  } catch {
    return { name: file.name, reason: 'exif-error' }
  }

  if (!gps || !isFinite(gps.latitude) || !isFinite(gps.longitude)) {
    return { name: file.name, reason: 'no-gps' }
  }

  try {
    // 촬영값이 없어도 GPS 만 있으면 통과다 — 이쪽 실패는 전체를 막지 않는다
    raw = (await exifr.parse(file, ['DateTimeOriginal', 'Make', 'Model', 'FNumber', 'ExposureTime', 'ISO'])) ?? {}
  } catch {
    raw = {}
  }

  // shot_at 폴백 사슬: DateTimeOriginal → file.lastModified
  const original = raw.DateTimeOriginal instanceof Date && !isNaN(raw.DateTimeOriginal.getTime())
    ? raw.DateTimeOriginal
    : new Date(file.lastModified)

  return {
    key: `${index}:${file.name}:${file.size}`,
    file,
    name: file.name,
    lat: gps.latitude,
    lng: gps.longitude,
    t: original.getTime(),
    shotAt: toLocalIso(original),
    camera: cameraName(asString(raw.Make), asString(raw.Model)),
    fNumber: asNumber(raw.FNumber),
    exposure: formatExposure(asNumber(raw.ExposureTime)),
    iso: asNumber(raw.ISO),
  }
}

function isSkipped(r: ScannedPhoto | SkippedPhoto): r is SkippedPhoto {
  return 'reason' in r
}

/**
 * 파일 목록을 훑어 통과/제외로 가른다.
 * 좌표 없는 사진을 조용히 버리지 않는다 — 제외 파일명이 그대로 UI 에 뜬다 (설계문서 §8).
 */
export async function scanFiles(
  files: readonly File[],
  onProgress?: (done: number, total: number) => void,
): Promise<ScanResult> {
  const passed: ScannedPhoto[] = []
  const skipped: SkippedPhoto[] = []

  for (let i = 0; i < files.length; i++) {
    const r = await scanOne(files[i]!, i)
    if (isSkipped(r)) skipped.push(r)
    else passed.push(r)
    onProgress?.(i + 1, files.length)
  }

  passed.sort((a, b) => a.t - b.t)
  return { passed, skipped }
}
