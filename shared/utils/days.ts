/**
 * 날짜별 묶기 — 상세 화면(1b)에서 포인트를 촬영 «날짜»로 나눈다.
 *
 * 번호는 날짜마다 01 부터 다시 시작한다. 그래서 번호만으로는 며칠차인지 알 수 없고,
 * 그 몫을 색이 맡는다 — 레일의 날짜 탭이 같은 색 점을 달고 있어서 범례 노릇을 한다.
 * (색만으로 구분하는 자리는 여기가 유일하지 않게 두는 게 원칙이라 이름·탭·구분줄에
 *  날짜를 글자로도 적는다.)
 */

/** 이 모듈이 요구하는 최소 모양. Point 를 그대로 받되 테스트는 이 세 필드만 만든다. */
export interface DayPoint {
  id: number
  title: string | null
  first_shot_at: string | null
}

/**
 * 날짜 색 — 다크 배경에서 서로 구분되는 6색. 밝기를 비슷하게 맞춰 어느 날짜도
 * 더 «중요해» 보이지 않게 했다. 7일차부터는 처음 색으로 돌아간다 (그때는 날짜 글자가 구분한다).
 * 활성 마커 흰색은 피했다 — 겹치면 상태 신호와 헷갈린다.
 * 난색(#E2A857)을 맨 뒤로 미뤄둔 것도 같은 이유다: 동선 색(--route #FFB454)과 가까워서
 * 축소된 지도에서 점이 선 위에 겹치면 둘이 한 덩어리로 보인다. 6일 넘는 기록에서만 만난다.
 */
export const DAY_COLORS = ['#92B2A9', '#7FA7D9', '#C48FBF', '#8FC98A', '#E08C7A', '#E2A857'] as const

/** 촬영 시각이 없는 포인트 (설계문서 §6 — 동선에서 빠지고 마커만 남는 그 포인트들) */
export const NO_DAY_COLOR = '#6B837E'

export interface DayGroup<T extends DayPoint> {
  /** 'YYYY-MM-DD'. 촬영 시각이 없으면 '' */
  date: string
  /** 며칠차 (1-based). 날짜 미상은 0 */
  n: number
  color: string
  points: T[]
}

export interface PointBadge {
  /** 그 날짜 안에서의 번호 — 날짜가 바뀌면 '01' 로 되돌아간다 */
  label: string
  color: string
  date: string
  n: number
  /** 화면에 쓰는 이름. 제목이 없으면 며칠차 몇 번인지로 채운다 (하루짜리면 그냥 「포인트 3」) */
  name: string
}

/**
 * 촬영 날짜로 묶는다. 순서는 입력 순서 그대로다 — 포인트는 이미 촬영 시각 순이고,
 * 여기서 다시 정렬하면 서버가 정한 순서와 어긋날 수 있다.
 */
export function groupByDay<T extends DayPoint>(points: readonly T[]): DayGroup<T>[] {
  const out: DayGroup<T>[] = []
  const byDate = new Map<string, DayGroup<T>>()
  let dated = 0

  for (const p of points) {
    const date = p.first_shot_at?.slice(0, 10) ?? ''
    let g = byDate.get(date)
    if (!g) {
      const n = date ? ++dated : 0
      g = {
        date,
        n,
        color: date ? DAY_COLORS[(n - 1) % DAY_COLORS.length]! : NO_DAY_COLOR,
        points: [],
      }
      byDate.set(date, g)
      out.push(g)
    }
    g.points.push(p)
  }
  return out
}

/** 포인트 id → 배지. 번호·색·이름을 한 곳에서 정해 레일·마커·상세가 어긋나지 않게 한다. */
export function badgesOf<T extends DayPoint>(groups: readonly DayGroup<T>[]): Map<number, PointBadge> {
  const multiDay = groups.length > 1
  const badges = new Map<number, PointBadge>()

  for (const g of groups) {
    g.points.forEach((p, i) => {
      const n = i + 1
      badges.set(p.id, {
        label: String(n).padStart(2, '0'),
        color: g.color,
        date: g.date,
        n,
        name: p.title ?? (multiDay && g.n ? `${g.n}일차 ${n}번` : `포인트 ${n}`),
      })
    })
  }
  return badges
}
