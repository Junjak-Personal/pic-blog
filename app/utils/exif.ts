/**
 * 업로드 1단계 — 파일에서 EXIF 를 뽑고 GPS 없는 사진을 걸러낸다.
 * 전부 클라이언트에서 돈다. 서버는 바이트를 디스크에 쓰기만 한다 (설계문서 §5).
 */
import exifr from 'exifr'
// 판정 키는 shared 가 SSOT 다 — 여기서 다시 내보내 스캔 쪽 임포트를 한 곳으로 모은다
import { photoKey } from '#shared/utils/photo'
import { bytesOf, headerOf, sourceName, type PhotoSource } from '~/utils/native'

export { photoKey }

export interface ScannedPhoto {
  /**
   * 업로드 세션 내 고유 키 — 서버가 배정한 photo.id 를 이 키로 되돌려준다.
   * photoKey 를 그대로 쓴다: 통과 목록 안에서는 중복이 제거돼 있으므로 이미 유일하고,
   * 파일 순번을 섞어 만들면 «묶음을 이어서 고를 때» 0번끼리 부딪힌다.
   */
  key: string
  /** 원본을 «읽는 법». 웹은 File, 네이티브 껍데기는 토큰이다 (utils/native.ts) */
  src: PhotoSource
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
  reason: 'no-gps' | 'exif-error' | 'duplicate' | 'already-in-post' | 'over-limit' | 'open-failed'
}

/**
 * 한 번에 처리할 사진 수 상한.
 *
 * 🔴 예전에는 50 이었고, 근거는 「고르고 나서 조용한 구간을 짧게 만든다」였다.
 *    그건 틀린 근거다 — 상한은 파일이 «도착한 뒤에» 자르므로 그 구간을 줄이지 못한다.
 *    브라우저 경로에서 200장을 고르면 iOS 가 200장을 전부 변환한 «다음»에 우리에게
 *    넘기고, 우리는 거기서 150장을 버린다. 기다린 시간만 버리는 셈이었다.
 *
 * 네이티브 껍데기(app-ios)에서는 그 변환이 아예 없다 — PhotoKit 이 원본을 그대로 준다.
 * 어느 쪽이든 상한이 막을 수 있는 것은 「우리가 처리할 양」뿐이라, 실사용 상한에 맞춰
 * 넉넉히 잡는다. 그래도 0 으로 두지 않는 이유는 실수로 수천 장을 고르는 것을 막기 위해서다.
 *
 * 이건 «한 번에» 의 상한이지 기록 전체의 상한이 아니다 — 새 기록은 1단계에서 여러 번
 * 이어서 고를 수 있고(useUploadFlow.selectFiles), 편집은 「이어서 추가」가 맡는다.
 */
export const MAX_PER_SELECTION = 500

/** 제외 사유 표시명 — 요약줄과 목록이 같은 말을 쓰도록 여기 하나만 둔다 */
export const SKIP_REASONS: Record<SkippedPhoto['reason'], string> = {
  'no-gps': '위치 정보 없음',
  'exif-error': 'EXIF 읽기 실패',
  'duplicate': '같은 사진 중복',
  'already-in-post': '이 기록에 이미 있음',
  'over-limit': '한 번에 처리할 수를 넘음',
  'open-failed': '원본을 열지 못함',
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
    notes.push(`한 번에 ${limit}장까지 처리합니다 — 나머지 ${over}장은 「사진 더 선택」으로 이어서 고르면 됩니다`)
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

async function scanOne(src: PhotoSource): Promise<ScannedPhoto | SkippedPhoto> {
  const name = sourceName(src)
  let gps: { latitude: number; longitude: number } | undefined
  let raw: RawExif = {}

  /*
   * 원본 전체가 아니라 «앞부분»만 읽는다. 웹에서는 File 이 그대로 와서 exifr 가 알아서
   * 부분만 읽고, 껍데기에서는 브리지가 헤더만 건네준다 — 전 장을 다 넘기면 200장에
   * 17초가 드는데 검사에는 헤더면 충분하다.
   */
  let head: Blob
  try {
    head = await headerOf(src)
  } catch {
    return { name, reason: 'exif-error' }
  }

  try {
    gps = await exifr.gps(head)
  } catch {
    gps = undefined
  }

  /*
   * 🔴 헤더에서 못 찾았다고 「위치 정보 없음」이라고 단정하면 안 된다.
   *    껍데기 경로에서는 원본의 «앞부분»만 받는데(bridge.dart 의 kHeaderBytes), EXIF 가
   *    어디 놓이는지는 카메라마다 다르다. 앞부분에 없었을 뿐인 사진을 좌표 없는 사진으로
   *    몰면 조용히 틀린 이유를 대는 것이 된다 — 업로드가 금지된 사진으로 취급된다.
   *    그래서 판정 전에 전체를 한 번 읽어본다. 대부분은 여기까지 오지 않는다.
   */
  if (!gps && src.kind === 'native') {
    try {
      head = await bytesOf(src)
      gps = await exifr.gps(head)
    } catch {
      return { name, reason: 'exif-error' }
    }
  }

  if (!gps || !isFinite(gps.latitude) || !isFinite(gps.longitude)) {
    return { name, reason: 'no-gps' }
  }

  try {
    // 촬영값이 없어도 GPS 만 있으면 통과다 — 이쪽 실패는 전체를 막지 않는다
    raw = (await exifr.parse(head, ['DateTimeOriginal', 'Make', 'Model', 'FNumber', 'ExposureTime', 'ISO'])) ?? {}
  } catch {
    raw = {}
  }

  /*
   * shot_at 폴백 사슬: DateTimeOriginal → File.lastModified.
   * 네이티브 쪽에는 lastModified 가 없다 — 사진첩 에셋에 대응하는 값이 아니라서
   * 억지로 만들면 「없는 시각」을 지어내는 게 된다. 그때는 현재 시각으로 두고,
   * 클러스터링이 그 사진을 제 자리에 못 놓는 것을 감수한다.
   */
  const original = raw.DateTimeOriginal instanceof Date && !isNaN(raw.DateTimeOriginal.getTime())
    ? raw.DateTimeOriginal
    : new Date(src.kind === 'file' ? src.file.lastModified : Date.now())

  const shotAt = toLocalIso(original)
  return {
    key: photoKey({ shotAt, lat: gps.latitude, lng: gps.longitude }),
    src,
    name,
    lat: gps.latitude,
    lng: gps.longitude,
    t: original.getTime(),
    shotAt,
    camera: cameraName(asString(raw.Make), asString(raw.Model)),
    fNumber: asNumber(raw.FNumber),
    exposure: formatExposure(asNumber(raw.ExposureTime)),
    iso: asNumber(raw.ISO),
  }
}

function isSkipped(r: ScannedPhoto | SkippedPhoto): r is SkippedPhoto {
  return 'reason' in r
}

export interface ScanOptions {
  /** 이미 이 «기록»에 들어 있는 사진들의 photoKey. 여기 걸리면 'already-in-post'. */
  inPost?: ReadonlySet<string>
  /** 앞선 묶음에서 이미 고른 사진들의 photoKey. 여기 걸리면 'duplicate' — 아직 올라간 게 아니다. */
  picked?: ReadonlySet<string>
  /** 한 번에 처리할 상한. 포인트별 추가처럼 더 작게 잡는 자리가 있다. */
  limit?: number
}

/**
 * 파일 목록을 훑어 통과/제외로 가른다.
 * 좌표 없는 사진도, 중복도 조용히 버리지 않는다 — 제외 파일명이 그대로 UI 에 뜬다 (설계문서 §8).
 */
export async function scanFiles(
  sources: readonly PhotoSource[],
  onProgress?: (done: number, total: number) => void,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  const { inPost, picked, limit = MAX_PER_SELECTION } = opts
  const passed: ScannedPhoto[] = []
  const skipped: SkippedPhoto[] = []
  /** 이미 통과한 키 — 같은 파일을 두 번 고른 경우를 여기서 잡는다.
      묶음을 이어서 고를 때 앞 묶음의 키를 씨앗으로 받아 같은 사유로 처리한다. */
  const seen = new Set<string>(picked)

  // 상한을 넘는 몫은 EXIF 를 읽기도 «전»에 잘라낸다 — 읽어봐야 어차피 안 쓴다
  const take = sources.slice(0, limit)
  for (const s of sources.slice(limit)) skipped.push({ name: sourceName(s), reason: 'over-limit' })
  onProgress?.(0, take.length)

  for (let i = 0; i < take.length; i++) {
    const r = await scanOne(take[i]!)
    onProgress?.(i + 1, take.length)
    if (isSkipped(r)) {
      skipped.push(r)
      continue
    }
    if (inPost?.has(r.key)) {
      skipped.push({ name: r.name, reason: 'already-in-post' })
      continue
    }
    if (seen.has(r.key)) {
      skipped.push({ name: r.name, reason: 'duplicate' })
      continue
    }
    seen.add(r.key)
    passed.push(r)
  }

  passed.sort((a, b) => a.t - b.t)
  return { passed, skipped }
}
