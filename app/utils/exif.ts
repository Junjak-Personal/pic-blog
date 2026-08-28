/**
 * 업로드 1단계 — 파일에서 EXIF 를 뽑고 GPS 없는 사진을 걸러낸다.
 * 전부 클라이언트에서 돈다. 서버는 바이트를 디스크에 쓰기만 한다 (설계문서 §5).
 */
import exifr from 'exifr'
// 판정 키는 shared 가 SSOT 다 — 여기서 다시 내보내 스캔 쪽 임포트를 한 곳으로 모은다
import { photoKey } from '#shared/utils/photo'

export { photoKey }

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
  reason: 'no-gps' | 'exif-error' | 'duplicate' | 'already-in-post' | 'over-limit'
}

/**
 * 한 번에 처리할 사진 수 상한.
 *
 * 브라우저가 File 목록을 넘겨주기 «전»까지는 페이지가 아무것도 알 수 없다.
 * 아이폰 사진첩에서 200장을 고르면 Safari 가 그걸 전부 복사·변환하는 동안 화면은
 * 완전히 조용하고, 사용자는 되고 있는 건지조차 알 수 없다 — 실제로 196장에서 그랬다.
 * 우리가 그 구간에 진행률을 그릴 방법은 없으므로, 대신 그 구간을 짧게 만든다.
 * 남은 사진은 저장한 뒤 「사진 추가」로 이어서 올린다.
 */
export const MAX_PER_SELECTION = 50

/** 제외 사유 표시명 — 요약줄과 목록이 같은 말을 쓰도록 여기 하나만 둔다 */
export const SKIP_REASONS: Record<SkippedPhoto['reason'], string> = {
  'no-gps': '위치 정보 없음',
  'exif-error': 'EXIF 읽기 실패',
  'duplicate': '같은 사진 중복',
  'already-in-post': '이 기록에 이미 있음',
  'over-limit': '한 번에 처리할 수를 넘음',
}

function countBy(files: readonly SkippedPhoto[], reason: SkippedPhoto['reason']) {
  return files.reduce((n, f) => (f.reason === reason ? n + 1 : n), 0)
}

/**
 * 사용자가 «다음에 무엇을 해야 하는지»까지 말해주는 한 줄.
 * 사유별 개수(summarizeSkipped)는 그 자체로 사실이지만, 상한과 중복은 조치가 따라붙는다.
 */
export function skipNotice(files: readonly SkippedPhoto[], limit = MAX_PER_SELECTION): string | null {
  const notes: string[] = []
  const over = countBy(files, 'over-limit')
  if (over) {
    notes.push(`한 번에 ${limit}장까지 처리합니다 — 나머지 ${over}장은 이 묶음을 올린 뒤 이어서 올리면 됩니다`)
  }
  const dup = countBy(files, 'already-in-post')
  if (dup) notes.push(`이미 올라간 사진 ${dup}장은 제외했습니다`)
  return notes.join(' · ') || null
}

/**
 * 「위치 정보 없음 2 · 같은 사진 중복 1」
 *
 * 제외 사유가 하나였을 땐 요약줄이 그 이유를 단정해도 됐지만, 이제 넷이다.
 * 숫자만 보여주고 사유를 감추면 「왜 빠졌는지 모르는 N장」이 된다 (설계문서 §8).
 */
export function summarizeSkipped(files: readonly SkippedPhoto[]) {
  const n = new Map<SkippedPhoto['reason'], number>()
  for (const f of files) n.set(f.reason, (n.get(f.reason) ?? 0) + 1)
  return [...n].map(([reason, count]) => `${SKIP_REASONS[reason]} ${count}`).join(' · ')
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
 * 좌표 없는 사진도, 중복도 조용히 버리지 않는다 — 제외 파일명이 그대로 UI 에 뜬다 (설계문서 §8).
 *
 * @param existingKeys 이미 이 기록에 들어 있는 사진들의 photoKey. 여기 걸리면 'already-in-post'.
 */
export async function scanFiles(
  files: readonly File[],
  onProgress?: (done: number, total: number) => void,
  existingKeys?: ReadonlySet<string>,
  /** 한 번에 처리할 상한. 포인트별 추가처럼 더 작게 잡는 자리가 있다. */
  limit = MAX_PER_SELECTION,
): Promise<ScanResult> {
  const passed: ScannedPhoto[] = []
  const skipped: SkippedPhoto[] = []
  /** 이번 선택 안에서 이미 통과한 키 — 같은 파일을 두 번 고른 경우를 여기서 잡는다 */
  const seen = new Set<string>()

  // 상한을 넘는 몫은 EXIF 를 읽기도 «전»에 잘라낸다 — 읽어봐야 어차피 안 쓴다
  const take = files.slice(0, limit)
  for (const f of files.slice(limit)) skipped.push({ name: f.name, reason: 'over-limit' })
  onProgress?.(0, take.length)

  for (let i = 0; i < take.length; i++) {
    const r = await scanOne(take[i]!, i)
    onProgress?.(i + 1, take.length)
    if (isSkipped(r)) {
      skipped.push(r)
      continue
    }
    const key = photoKey(r)
    if (existingKeys?.has(key)) {
      skipped.push({ name: r.name, reason: 'already-in-post' })
      continue
    }
    if (seen.has(key)) {
      skipped.push({ name: r.name, reason: 'duplicate' })
      continue
    }
    seen.add(key)
    passed.push(r)
  }

  passed.sort((a, b) => a.t - b.t)
  return { passed, skipped }
}
