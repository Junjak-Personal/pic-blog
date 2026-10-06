/**
 * 반경 클러스터링 — 두 시점, 두 규칙 (설계 문서 §4).
 *   clusterAt(R)  최초 업로드   : 촬영 시각 순 스트리밍, 합류할 때마다 중심 재계산
 *   assignTo(R)   사진 추가     : 기존 포인트 중심 불변
 * 원본은 _workspace/deisgn/data.js 의 clusterAt() / assign() 이다.
 *
 * 둘 다 «일차»와 «공백»으로도 끊는다. 그 기준은 기록마다 다르고 trip-day.ts 가 갖는다.
 *
 * 🔴 포인트는 «한 일차»에 속한다 — 상세 화면이 first_shot_at 의 일차로 포인트를 묶고(days.ts)
 *    며칠차 색·번호를 거기서 뽑기 때문이다. 한 포인트가 일차 경계를 넘으면 둘째 날 사진이
 *    첫째 날 밑에 들어가 버린다. 공백 규칙은 그걸 «근사»했을 뿐이라 23:50 → 00:20 처럼
 *    공백이 짧은 경계를 놓쳤다. 일차는 근사가 아니라 못 박는다.
 */

import { distanceM } from './geo.ts'
import { DEFAULT_DAY_RULES, DEFAULT_GAP_MINUTES, type DayRules } from './trip-day.ts'

/** 공백 기준의 기본값 — 기록이 일차별로 따로 정하지 않았을 때 쓴다 (trip-day.ts). */
export const GAP_MINUTES = DEFAULT_GAP_MINUTES

export const RADII = [20, 50, 100, 200, 500] as const
export const DEFAULT_RADIUS = 50

export interface ClusterInput {
  /** 파일 식별자 — 업로드 세션 내에서 사진을 되짚는 키 */
  key: string
  lat: number
  lng: number
  /** epoch ms. shot_at 이 없는 사진은 업로드 전에 걸러진다 */
  t: number
}

export interface Cluster<T extends ClusterInput> {
  /** 확정 위치는 대표 사진(촬영 시각 순 첫 사진). 묶는 동안에만 평균 중심을 쓴다. */
  lat: number
  lng: number
  shots: T[]
  /** 시작 · 종료 촬영 시각 (epoch ms) */
  tStart: number
  tEnd: number
  /** true = 거리는 반경 안이었는데 공백 기준(일차별, 기본 90분) 때문에 끊긴 클러스터 */
  gap: boolean
  /** 직전 클러스터와의 공백 (분). gap 이 false 면 의미 없다. */
  gapMinutes: number
  /** true = «일차»가 바뀌어 끊긴 클러스터. 이쪽이 이유면 gap 은 서지 않는다 — 둘 다 켜면 화면이 「30분 공백으로 끊김」이라고 거짓말한다. */
  dayBreak: boolean
  /** 클러스터 실제 퍼짐 (m). centroid 드리프트 때문에 R 을 넘을 수 있다 — 버그가 아니다 (§4.1.1). */
  spread: number
}

/**
 * 좌표 평균. 클러스터의 합류 판정과 편집 화면의 명시적인 「사진 평균」 선택에 쓴다.
 */
export function centroid(shots: readonly { lat: number; lng: number }[]) {
  let lat = 0
  let lng = 0
  for (const s of shots) {
    lat += s.lat
    lng += s.lng
  }
  return { lat: lat / shots.length, lng: lng / shots.length }
}

function spreadOf<T extends ClusterInput>(shots: T[]) {
  let max = 0
  for (let i = 0; i < shots.length; i++) {
    for (let j = i + 1; j < shots.length; j++) {
      const d = distanceM([shots[i]!.lat, shots[i]!.lng], [shots[j]!.lat, shots[j]!.lng])
      if (d > max) max = d
    }
  }
  return Math.round(max)
}

/**
 * 최초 업로드. 촬영 시각 오름차순으로 훑으며 "진행 중인 클러스터" 하나만 유지한다.
 * 전체 후보와 비교하지 않는다 — 사슬처럼 이어지는 것이 이 알고리즘의 성질이다.
 */
export function clusterAt<T extends ClusterInput>(
  shots: readonly T[],
  radiusM: number,
  rules: DayRules = DEFAULT_DAY_RULES,
): Cluster<T>[] {
  const sorted = [...shots].sort((a, b) => a.t - b.t)
  const out: Cluster<T>[] = []
  let cur: Cluster<T> | null = null

  for (const s of sorted) {
    if (cur) {
      const dm = distanceM([cur.lat, cur.lng], [s.lat, s.lng])
      const mins: number = (s.t - cur.tEnd) / 60000
      const curDay = rules.dayOf(cur.tEnd)
      // 타입 주석은 필수다 — cur 에 다시 대입하는 리터럴이 이 값을 참조해 추론이 순환한다 (mins 와 같은 사정)
      const dayBreak: boolean = rules.dayOf(s.t) !== curDay
      // 공백 기준은 «진행 중인 포인트»가 속한 일차의 것을 쓴다
      if (dm <= radiusM && mins <= rules.gapMinutesOf(curDay) && !dayBreak) {
        cur.shots.push(s)
        const c = centroid(cur.shots)
        cur.lat = c.lat
        cur.lng = c.lng
        cur.tEnd = s.t
        continue
      }
      // 새 클러스터를 연다. 거리가 반경 안이었다면 끊긴 이유는 날짜 아니면 시간이다.
      cur = {
        shots: [s],
        lat: s.lat,
        lng: s.lng,
        tStart: s.t,
        tEnd: s.t,
        gap: dm <= radiusM && !dayBreak,
        gapMinutes: Math.round(mins),
        dayBreak,
        spread: 0,
      }
    } else {
      cur = { shots: [s], lat: s.lat, lng: s.lng, tStart: s.t, tEnd: s.t, gap: false, gapMinutes: 0, dayBreak: false, spread: 0 }
    }
    out.push(cur)
  }

  for (const c of out) {
    c.spread = spreadOf(c.shots)
    // 묶기가 끝난 뒤에만 앵커를 정한다. 도중에 바꾸면 클러스터 합류 판정이 달라진다.
    c.lat = c.shots[0]!.lat
    c.lng = c.shots[0]!.lng
  }
  return out
}

export interface ExistingPoint {
  id: number
  title: string | null
  lat: number
  lng: number
  order_index: number
  /** 이 포인트가 속한 일차. 다른 일차 사진은 «같은 자리라도» 합류하지 않는다 (이 파일 맨 위 🔴). */
  first_shot_at: string | null
  /** 이 포인트의 마지막 촬영 시각. 모르면 first_shot_at 으로 본다 — 공백 기준을 재는 끝이다. */
  last_shot_at?: string | null
}

export interface Join<T extends ClusterInput> {
  point: ExistingPoint
  shots: T[]
  /** 중심에서 가장 먼 합류 사진까지의 거리 (m) */
  farthest: number
}

export interface AssignResult<T extends ClusterInput> {
  joins: Join<T>[]
  news: Cluster<T>[]
  joinedShots: number
  total: number
}

/**
 * 사진 추가. 기존 포인트 중심에서 R 안이고 «같은 일차»이며 공백 기준 안이면 합류하고 —
 * 기존 중심은 절대 움직이지 않는다. 남은 사진끼리는 clusterAt 규칙으로 다시 묶어 새 포인트를 만든다.
 */
export function assignTo<T extends ClusterInput>(
  shots: readonly T[],
  points: readonly ExistingPoint[],
  radiusM: number,
  rules: DayRules = DEFAULT_DAY_RULES,
): AssignResult<T> {
  const joins = new Map<number, Join<T>>()
  const pending: T[] = []
  /** 포인트별 촬영 시각 범위 [처음, 끝]. 합류한 사진이 끝을 늘린다 — 시각 순으로 훑으므로 사슬로 이어진다. */
  const spans = new Map<number, { from: number; to: number }>()
  for (const p of points) {
    if (!p.first_shot_at) continue
    spans.set(p.id, { from: Date.parse(p.first_shot_at), to: Date.parse(p.last_shot_at ?? p.first_shot_at) })
  }

  for (const s of [...shots].sort((a, b) => a.t - b.t)) {
    const day = rules.dayOf(s.t)
    let best: ExistingPoint | null = null
    let bestD = Infinity
    for (const p of points) {
      /*
       * 일차·공백이 맞지 않으면 후보에서 «먼저» 뺀다. 가장 가까운 것을 고른 «뒤»에 보면,
       * 바로 옆의 다른 일차 포인트 하나 때문에 반경 안의 맞는 포인트를 놓친다.
       * 시각을 모르는 포인트(사진이 없거나 shot_at 이 없는)는 막지 않는다 — 막을 근거가 없다.
       */
      const span = spans.get(p.id)
      if (p.first_shot_at && span) {
        const pday = rules.dayOfIso(p.first_shot_at)
        if (pday !== day) continue
        // 같은 일차여도 크게 비면 같은 자리라도 다른 포인트다 (숙소에서 06시에 찍고 23시에 또 찍은 것)
        const gapMs = rules.gapMinutesOf(pday) * 60_000
        if (s.t < span.from - gapMs || s.t > span.to + gapMs) continue
      }
      const d = distanceM([p.lat, p.lng], [s.lat, s.lng])
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    if (best && bestD <= radiusM) {
      const j = joins.get(best.id) ?? { point: best, shots: [], farthest: 0 }
      j.shots.push(s)
      if (bestD > j.farthest) j.farthest = Math.round(bestD)
      joins.set(best.id, j)
      const span = spans.get(best.id)
      if (span && s.t > span.to) span.to = s.t
    } else {
      pending.push(s)
    }
  }

  const list = [...joins.values()].sort((a, b) => a.point.order_index - b.point.order_index)
  return {
    joins: list,
    news: clusterAt(pending, radiusM, rules),
    joinedShots: list.reduce((n, j) => n + j.shots.length, 0),
    total: shots.length,
  }
}
