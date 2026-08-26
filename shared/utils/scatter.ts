/**
 * 스캐터 배치 — 지터 격자에서 시작해 타원 충돌 완화를 6회 돌린다.
 * 시드 기반 LCG 라 결정적이다: 새로고침해도 위치가 흔들리지 않는다. Math.random() 금지.
 * 원본은 _workspace/deisgn/data.js 의 scatter()/field()/relax()/jitterGrid().
 */

/** 썸네일 가로/세로 비 */
const CARD = 0.746

export const FIELD_DESKTOP = { w: 716, h: 632 } as const
export const FIELD_MOBILE = { w: 390, h: 430 } as const

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

type Pt = [number, number]

function jitterGrid(n: number, hw: number, hh: number, rnd: () => number, jitter: number): Pt[] {
  const cols = Math.max(1, Math.round(Math.sqrt((n * hw) / Math.max(1e-4, hh * CARD))))
  const rows = Math.max(1, Math.ceil(n / cols))
  const cw = (2 * hw) / cols
  const ch = (2 * hh) / rows
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    const lastRow = Math.floor((n - 1) / cols)
    const inRow = r === lastRow ? n - lastRow * cols : cols
    const offset = ((cols - inRow) * cw) / 2
    pts.push([
      -hw + offset + (c + 0.5) * cw + (rnd() - 0.5) * cw * jitter,
      -hh + (r + 0.5) * ch + (rnd() - 0.5) * ch * jitter,
    ])
  }
  return pts
}

function relax(pts: Pt[], hws: number[], hhs: number[], bw: number, bh: number, iters: number, strength: number) {
  for (let k = 0; k < iters; k++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const fw = (hws[i]! + hws[j]!) * strength
        const fh = (hhs[i]! + hhs[j]!) * strength
        const dx = pts[j]![0] - pts[i]![0]
        const dy = pts[j]![1] - pts[i]![1]
        const mx = dx / fw
        const my = dy / fh
        const d2 = mx * mx + my * my
        if (d2 >= 1 || d2 < 1e-9) continue
        const dd = Math.sqrt(d2)
        const push = (1 - dd) * 0.5
        const ex = (mx / dd) * fw * push
        const ey = (my / dd) * fh * push
        pts[i]![0] -= ex
        pts[i]![1] -= ey
        pts[j]![0] += ex
        pts[j]![1] += ey
      }
    }
    for (const p of pts) {
      p[0] = clamp(p[0], -bw, bw)
      p[1] = clamp(p[1], -bh, bh)
    }
  }
  return pts
}

/** 결과는 필드 기준 백분율 좌표 [x%, y%] */
function field(n: number, seed: number, fw: number, fh: number, sizes: Pt[], jitter: number): Pt[] {
  const rnd = lcg(seed)
  let maxW = 0
  let maxH = 0
  for (const z of sizes) {
    if (z[0] > maxW) maxW = z[0]
    if (z[1] > maxH) maxH = z[1]
  }
  const hw = Math.max(8, fw / 2 - maxW / 2 - 10)
  const hh = Math.max(8, fh / 2 - maxH / 2 - 10)
  const pts = jitterGrid(n, hw, hh, rnd, jitter)
  relax(
    pts,
    sizes.map((z) => z[0] / 2),
    sizes.map((z) => z[1] / 2),
    hw,
    hh,
    6,
    0.72,
  )
  return pts.map((p) => [
    +(((p[0] + fw / 2) / fw) * 100).toFixed(2),
    +(((p[1] + fh / 2) / fh) * 100).toFixed(2),
  ])
}

/** 카드 크기는 장수에 반응한다 — sqrt(필드 면적 / 장수). 3장이면 크게, 15장이면 썸네일로. */
function baseW(n: number, fw: number, fh: number) {
  const h = Math.sqrt((fw * fh) / Math.max(1, n) / CARD) * 0.62
  return clamp(h * CARD, 60, 152)
}

export interface ScatterCard {
  /** 데스크탑 크기 · 위치 (%) */
  w: number
  h: number
  x: number
  y: number
  /** 모바일 크기 · 위치 (%) */
  wm: number
  hm: number
  xm: number
  ym: number
  /** ±4° 회전 포함 transform */
  transform: string
  opacity: number
  z: number
  border: string
}

/** seed 는 포인트마다 고정값을 준다 (예: 9301 + pointId * 7717). */
export function scatter(n: number, seed: number): ScatterCard[] {
  if (n <= 0) return []
  const rnd = lcg(seed * 3 + 11)
  const bd = baseW(n, FIELD_DESKTOP.w, FIELD_DESKTOP.h)
  const bm = baseW(n, FIELD_MOBILE.w, FIELD_MOBILE.h)
  const jitter = n <= 4 ? 0.5 : 0.8

  const base = Array.from({ length: n }, () => {
    const v = 0.92 + rnd() * 0.16
    return {
      w: Math.round(bd * v),
      wm: Math.round(bm * v),
      rot: +((rnd() - 0.5) * 8).toFixed(2),
      ghost: n >= 10 && rnd() < 0.14,
    }
  })

  const sizesD = base.map((o): Pt => [o.w, o.w * 1.34])
  const sizesM = base.map((o): Pt => [o.wm, o.wm * 1.34])
  const pd = field(n, seed, FIELD_DESKTOP.w, FIELD_DESKTOP.h, sizesD, jitter)
  const pm = field(n, seed + 977, FIELD_MOBILE.w, FIELD_MOBILE.h, sizesM, jitter)

  return base.map((o, i) => ({
    w: o.w,
    h: Math.round(o.w * 1.34),
    wm: o.wm,
    hm: Math.round(o.wm * 1.34),
    x: pd[i]![0],
    y: pd[i]![1],
    xm: pm[i]![0],
    ym: pm[i]![1],
    transform: `translate(-50%,-50%) rotate(${o.rot}deg)`,
    opacity: o.ghost ? 0.26 : 1,
    z: o.ghost ? 1 : 2 + i,
    border: o.ghost ? '1px solid rgba(177,199,193,0.06)' : '1px solid rgba(177,199,193,0.14)',
  }))
}
