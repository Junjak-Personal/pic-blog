/** 표시 포맷 — 좌표·시각·거리·EXIF 촬영값. */

export function parseTags(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

/**
 * epoch ms → 타임존 없는 로컬 ISO 문자열.
 * EXIF DateTimeOriginal 은 타임존이 없는 벽시계 값이라 toISOString() 으로 돌리면
 * UTC 로 밀려 시각이 어긋난다 (09:00 이 00:00 으로 표시됨).
 */
export function localIso(epochMs: number) {
  const d = new Date(epochMs)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** '2026-08-23T18:35:39' → '2026.08.23 18:35' */
export function formatDateTime(iso: string | null) {
  if (!iso) return ''
  const [d, t] = iso.split('T')
  if (!d) return ''
  return `${d.replaceAll('-', '.')} ${(t ?? '').slice(0, 5)}`.trim()
}

export function formatTime(iso: string | null) {
  if (!iso) return ''
  return (iso.split('T')[1] ?? '').slice(0, 5)
}

export function formatDate(iso: string | null) {
  if (!iso) return ''
  return (iso.split('T')[0] ?? '').replaceAll('-', '.')
}

/** 2026.08.22 – 08.24 */
export function formatRange(start: string | null, end: string | null) {
  if (!start) return ''
  const s = formatDate(start)
  if (!end) return s
  const e = formatDate(end)
  return s === e ? s : `${s} – ${e.slice(5)}`
}

/** ExposureTime 은 초 단위 실수(0.008333…)로 온다 → '1/120' 표시형. */
export function formatExposure(seconds: number | null | undefined): string | null {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return null
  if (seconds >= 1) return `${+seconds.toFixed(1)}`
  return `1/${Math.round(1 / seconds)}`
}

/** 'f/1.78 · 1/120s · ISO 64' — 값이 하나도 없으면 null 이라 그 줄을 감춘다. */
export function formatExifLine(p: {
  f_number: number | null
  exposure: string | null
  iso: number | null
}): string | null {
  const parts: string[] = []
  // EXIF 의 조리개는 유리수(예 89/50)를 나눈 값이라 f/1.7799999713880652 처럼 나온다
  if (p.f_number != null) parts.push(`f/${Number(p.f_number.toFixed(2))}`)
  if (p.exposure) parts.push(`${p.exposure}s`)
  if (p.iso != null) parts.push(`ISO ${p.iso}`)
  return parts.length ? parts.join(' · ') : null
}

export function formatKm(km: number) {
  return km >= 10 ? km.toFixed(1) : km.toFixed(1)
}

/** 90분 갭 라벨: 120분 이상은 시간 단위로 */
export function formatGap(minutes: number) {
  return minutes >= 120 ? `${Math.round(minutes / 60)}시간 공백 뒤` : `${minutes}분 공백 뒤`
}

export function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'record'
}

/**
 * 저장된 파일 확장자에서 표기용 포맷 이름을 뽑는다.
 *
 * "WebP" 를 하드코딩하면 안 된다 — iOS Safari 는 canvas WebP 인코딩을 지원하지 않아
 * (MDN BCD api.HTMLCanvasElement.toBlob.type_parameter_webp: safari/safari_ios false)
 * 아이폰에서 올린 사진은 전부 JPEG 로 떨어진다. 실제 파일과 라벨이 어긋나면
 * 화면이 조용히 거짓말을 하게 된다.
 */
export function formatOf(path: string | null | undefined) {
  if (!path) return null
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'webp') return 'WebP'
  if (ext === 'jpeg' || ext === 'jpg') return 'JPEG'
  return null
}
