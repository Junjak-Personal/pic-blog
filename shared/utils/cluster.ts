/**
 * 반경 클러스터링 — 두 시점, 두 규칙 (설계 문서 §4).
 *   clusterAt(R)  최초 업로드   : 촬영 시각 순 스트리밍, 합류할 때마다 중심 재계산
 *   assignTo(R)   사진 추가     : 기존 포인트 중심 불변
 * 원본은 _workspace/deisgn/data.js 의 clusterAt() / assign() 이다.
 */

import { distanceM } from './geo.ts'

/** 거리와 무관하게 이 이상 비면 클러스터를 끊는다. 없으면 같은 자리로 돌아온 다음 날이 한 포인트가 된다. */
export const GAP_MINUTES = 90

export const RADII = [20, 50, 100, 200] as const
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
  /** 소속 사진들의 centroid. 확정 저장되는 순간 point.lat/lng 가 되고 이후 불변이다. */
  lat: number
  lng: number
  shots: T[]
  /** 시작 · 종료 촬영 시각 (epoch ms) */
  tStart: number
  tEnd: number
  /** true = 거리는 반경 안이었는데 90분 갭 때문에 끊긴 클러스터 */
  gap: boolean
  /** 직전 클러스터와의 공백 (분). gap 이 false 면 의미 없다. */
  gapMinutes: number
  /** 클러스터 실제 퍼짐 (m). centroid 드리프트 때문에 R 을 넘을 수 있다 — 버그가 아니다 (§4.1.1). */
  spread: number
}

function centroid<T extends ClusterInput>(shots: T[]) {
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
export function clusterAt<T extends ClusterInput>(shots: readonly T[], radiusM: number): Cluster<T>[] {
  const sorted = [...shots].sort((a, b) => a.t - b.t)
  const out: Cluster<T>[] = []
  let cur: Cluster<T> | null = null

  for (const s of sorted) {
    if (cur) {
      const dm = distanceM([cur.lat, cur.lng], [s.lat, s.lng])
      const mins: number = (s.t - cur.tEnd) / 60000
      if (dm <= radiusM && mins <= GAP_MINUTES) {
        cur.shots.push(s)
        const c = centroid(cur.shots)
        cur.lat = c.lat
        cur.lng = c.lng
        cur.tEnd = s.t
        continue
      }
      // 새 클러스터를 연다. 거리가 반경 안이었다면 끊긴 이유는 시간이다.
      cur = {
        shots: [s],
        lat: s.lat,
        lng: s.lng,
        tStart: s.t,
        tEnd: s.t,
        gap: dm <= radiusM,
        gapMinutes: Math.round(mins),
        spread: 0,
      }
    } else {
      cur = { shots: [s], lat: s.lat, lng: s.lng, tStart: s.t, tEnd: s.t, gap: false, gapMinutes: 0, spread: 0 }
    }
    out.push(cur)
  }

  for (const c of out) c.spread = spreadOf(c.shots)
  return out
}

export interface ExistingPoint {
  id: number
  title: string | null
  lat: number
  lng: number
  order_index: number
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
 * 사진 추가. 기존 포인트 중심에서 R 안이면 합류하고 — 기존 중심은 절대 움직이지 않는다.
 * R 밖인 사진끼리는 clusterAt 규칙으로 다시 묶어 새 포인트를 만든다.
 */
export function assignTo<T extends ClusterInput>(
  shots: readonly T[],
  points: readonly ExistingPoint[],
  radiusM: number,
): AssignResult<T> {
  const joins = new Map<number, Join<T>>()
  const pending: T[] = []

  for (const s of [...shots].sort((a, b) => a.t - b.t)) {
    let best: ExistingPoint | null = null
    let bestD = Infinity
    for (const p of points) {
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
    } else {
      pending.push(s)
    }
  }

  const list = [...joins.values()].sort((a, b) => a.point.order_index - b.point.order_index)
  return {
    joins: list,
    news: clusterAt(pending, radiusM),
    joinedShots: list.reduce((n, j) => n + j.shots.length, 0),
    total: shots.length,
  }
}
