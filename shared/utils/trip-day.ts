/**
 * 일차 — 여행의 「하루」는 달력 날짜가 아니라 잠들기까지다.
 *
 * 마지막 일정이 다음 날 01:00 에 끝났다고 그 사진을 다음 일차로 보내면 일차가 거짓말을
 * 한다. 그래서 기록마다 일차별로 «끝나는 시각»을 둔다 (기본정보 → 기간). 한 일차의 끝이
 * 곧 다음 일차의 시작이라 빈틈도 겹침도 없다 — 모든 사진은 정확히 한 일차에 속한다.
 *
 *   1일차  8/22 00:00 ~ 8/23 02:00   ← { date: '2026-08-22', endTime: '02:00' }
 *   2일차  8/23 02:00 ~ 8/24 00:00   ← 지정 없음 = 자정
 *
 * 같은 행에 그 일차의 «공백 기준»도 둔다 — 사진 사이가 이만큼 비면 같은 자리라도 포인트를
 * 나눈다 (숙소에서 06시에 찍고 23시에 또 찍은 것은 다른 포인트다).
 *
 * 묶기(cluster.ts) · 사진 추가 배정 · 상세 화면 일차 탭(days.ts) · 서버 재묶기가 모두
 * 이 파일 하나를 읽는다. 어느 하나라도 따로 계산하면 같은 사진이 화면마다 다른 일차가 된다.
 */
import { localIso } from './format.ts'

/** 지정이 없을 때의 공백 기준(분). 예전 GAP_MINUTES 고정값이다. */
export const DEFAULT_GAP_MINUTES = 90

/** 일차의 끝은 «다음 날» 정오 전까지만 미룰 수 있다. 그보다 늦으면 그건 이미 다음 일차의 일정이다. */
const MAX_END_MINUTES = 12 * 60
const MIN_GAP_MINUTES = 10
const MAX_GAP_MINUTES = 24 * 60
/** 일차 수 상한 — 기간이 비정상적으로 길어도 화면 행과 저장 크기가 끝없이 늘지 않게 */
export const MAX_TRIP_DAYS = 60

export interface DaySetting {
  /** 일차가 시작하는 달력 날짜 'YYYY-MM-DD' */
  date: string
  /** 이 일차가 끝나는 «다음 날» 시각 'HH:mm'. 없으면 자정('00:00') */
  endTime?: string
  /** 이 일차의 공백 기준(분). 없으면 DEFAULT_GAP_MINUTES */
  gapMinutes?: number
}

/** 기본정보의 고르개가 내놓는 값들. 서버는 이 목록이 아니라 범위로 검증한다. */
export const END_TIME_OPTIONS = Array.from({ length: 17 }, (_, i) => {
  const m = i * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})
export const GAP_OPTIONS = [30, 60, 90, 120, 180, 240, 360] as const

export interface DayRules {
  /** epoch ms → 일차 날짜 'YYYY-MM-DD' */
  dayOf(epochMs: number): string
  /** 벽시계 ISO 'YYYY-MM-DDTHH:mm:ss' → 일차 날짜. 시각이 없는 값은 그 날짜 그대로다. */
  dayOfIso(iso: string): string
  /** 그 일차의 공백 기준(분) */
  gapMinutesOf(day: string): number
}

/**
 * 🔴 epoch 은 반드시 localIso 로 «벽시계»에 되돌린 뒤 판정한다. EXIF 는 타임존이 없는
 *    벽시계 시각이라 UTC 로 자르면 일차가 9시간씩 밀린다.
 */
export function dayRules(settings: readonly DaySetting[] = []): DayRules {
  const byDate = new Map(settings.map((s) => [s.date, s]))
  const dayOfIso = (iso: string) => {
    const date = iso.slice(0, 10)
    if (iso.length < 16) return date
    // 전날 일차가 오늘 새벽까지 이어지면 그 일차다. 끝은 정오 전이라 하루만 거슬러 보면 된다.
    const prev = shiftDate(date, -1)
    const end = byDate.get(prev)?.endTime
    return end && iso.slice(11, 16) < end ? prev : date
  }
  return {
    dayOfIso,
    dayOf: (t) => dayOfIso(localIso(t)),
    gapMinutesOf: (day) => byDate.get(day)?.gapMinutes ?? DEFAULT_GAP_MINUTES,
  }
}

/** 지정이 하나도 없는 기록 — 자정 경계 · 90분 공백 */
export const DEFAULT_DAY_RULES = dayRules()

/** 'YYYY-MM-DD' 를 n 일 옮긴다. 달력 계산만 하므로 UTC 로 돌려도 날짜가 밀리지 않는다. */
export function shiftDate(date: string, n: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** 기간의 날짜 목록 (양 끝 포함). 비었거나 거꾸로면 빈 배열, MAX_TRIP_DAYS 에서 자른다. */
export function tripDates(start: string, end: string) {
  if (!DATE.test(start) || !DATE.test(end) || start > end) return []
  const out: string[] = []
  for (let d = start; d <= end && out.length < MAX_TRIP_DAYS; d = shiftDate(d, 1)) out.push(d)
  return out
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

export type DaySettingsResult = { ok: true; value: DaySetting[] } | { ok: false; error: string }

/**
 * 외부 입력(요청 본문 · DB 의 JSON)을 저장할 모양으로 좁힌다.
 * 기본값과 같은 칸은 지워 「지정 안 함」으로 되돌린다 — 그래야 「바뀐 것이 있나」를
 * 문자열 비교 하나로 볼 수 있다. 날짜순으로 정렬한다.
 */
export function validateDaySettings(raw: unknown): DaySettingsResult {
  if (!Array.isArray(raw)) return { ok: false, error: 'daySettings: 배열이어야 합니다' }
  if (raw.length > MAX_TRIP_DAYS) return { ok: false, error: `daySettings: ${MAX_TRIP_DAYS}일을 넘습니다` }

  const out: DaySetting[] = []
  const seen = new Set<string>()
  for (const one of raw) {
    if (typeof one !== 'object' || one === null) return { ok: false, error: 'daySettings: 객체여야 합니다' }
    const { date, endTime, gapMinutes } = one as Record<string, unknown>
    if (typeof date !== 'string' || !DATE.test(date)) return { ok: false, error: 'daySettings.date: YYYY-MM-DD 형식이어야 합니다' }
    if (seen.has(date)) return { ok: false, error: `daySettings.date: ${date} 가 두 번 나옵니다` }
    seen.add(date)

    const s: DaySetting = { date }
    if (endTime != null) {
      if (typeof endTime !== 'string' || !TIME.test(endTime)) return { ok: false, error: 'daySettings.endTime: HH:mm 형식이어야 합니다' }
      if (minutesOf(endTime) >= MAX_END_MINUTES) return { ok: false, error: 'daySettings.endTime: 다음 날 정오 전이어야 합니다' }
      if (endTime !== '00:00') s.endTime = endTime
    }
    if (gapMinutes != null) {
      if (typeof gapMinutes !== 'number' || !Number.isInteger(gapMinutes)
        || gapMinutes < MIN_GAP_MINUTES || gapMinutes > MAX_GAP_MINUTES) {
        return { ok: false, error: `daySettings.gapMinutes: ${MIN_GAP_MINUTES}~${MAX_GAP_MINUTES} 사이의 정수여야 합니다` }
      }
      if (gapMinutes !== DEFAULT_GAP_MINUTES) s.gapMinutes = gapMinutes
    }
    if (s.endTime || s.gapMinutes) out.push(s)
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1))
  return { ok: true, value: out }
}

/** DB 의 JSON 문자열을 읽는다. 망가진 값은 「지정 없음」으로 본다 — 화면이 죽는 것보다 자정 경계가 낫다. */
export function parseDaySettings(json: string | null | undefined): DaySetting[] {
  try {
    const r = validateDaySettings(JSON.parse(json ?? '[]'))
    return r.ok ? r.value : []
  } catch {
    return []
  }
}
