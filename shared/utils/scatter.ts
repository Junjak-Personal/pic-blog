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
function field(
  n: number,
  seed: number,
  fw: number,
  fh: number,
  sizes: Pt[],
  jitter: number,
  strength: number,
  edge: number,
): Pt[] {
  const rnd = lcg(seed)
  let maxW = 0
  let maxH = 0
  for (const z of sizes) {
    if (z[0] > maxW) maxW = z[0]
    if (z[1] > maxH) maxH = z[1]
  }
  const hw = Math.max(8, fw / 2 - maxW * edge - 8)
  const hh = Math.max(8, fh / 2 - maxH * edge - 8)
  const pts = jitterGrid(n, hw, hh, rnd, jitter)
  relax(
    pts,
    sizes.map((z) => z[0] / 2),
    sizes.map((z) => z[1] / 2),
    hw,
    hh,
    6,
    strength,
  )
  return pts.map((p) => [
    +(((p[0] + fw / 2) / fw) * 100).toFixed(2),
    +(((p[1] + fh / 2) / fh) * 100).toFixed(2),
  ])
}

/**
 * 장수 구간. 6장까지는 크게 조금 겹치고, 그 위는 가장자리까지 흩어 쌓임을 줄인다.
 * scale 이 클수록 카드가 크고, relax 가 클수록 더 밀어낸다.
 * edge 는 중심이 변에서 떨어지는 비율 — 작을수록 필드 끝까지 퍼진다.
 */
function pack(n: number) {
  if (n <= 6) return { scale: 1.12, relax: 0.68, min: 88, jitter: n <= 4 ? 0.5 : 0.8, edge: 0.5 }
  if (n <= 10) return { scale: 0.92, relax: 0.82, min: 82, jitter: 0.55, edge: 0.4 }
  if (n <= 16) return { scale: 0.94, relax: 0.84, min: 80, jitter: 0.5, edge: 0.3 }
  return { scale: 0.78, relax: 0.9, min: 72, jitter: 0.45, edge: 0.26 }
}

/** 카드 크기는 sqrt(필드 면적 / 장수) · 구간 배수를 따른다. */
function baseW(n: number, fw: number, fh: number, scale: number, min: number) {
  const h = Math.sqrt((fw * fh) / Math.max(1, n) / CARD) * scale
  return clamp(h * CARD, min, 152)
}

export interface ScatterCard {
  /** 필드 기준 크기(px) · 위치(%) */
  w: number
  h: number
  x: number
  y: number
  /** ±4° 회전 포함 transform */
  transform: string
  opacity: number
  z: number
  border: string
}

/**
 * seed 는 포인트마다 고정값을 준다 (예: 9301 + pointId * 7717).
 * fw/fh 는 실제 필드 픽셀 — 컨테이너가 커지면 카드도 커진다.
 */
export function scatter(
  n: number,
  seed: number,
  fw: number = FIELD_DESKTOP.w,
  fh: number = FIELD_DESKTOP.h,
): ScatterCard[] {
  if (n <= 0) return []
  const rnd = lcg(seed * 3 + 11)
  const { scale, relax: strength, min, jitter, edge } = pack(n)
  const bw = baseW(n, fw, fh, scale, min)

  const base = Array.from({ length: n }, () => {
    const v = 0.92 + rnd() * 0.16
    return {
      w: Math.round(bw * v),
      rot: +((rnd() - 0.5) * 8).toFixed(2),
    }
  })

  const sizes = base.map((o): Pt => [o.w, o.w * 1.34])
  const pts = field(n, seed, fw, fh, sizes, jitter, strength, edge)

  return base.map((o, i) => ({
    w: o.w,
    h: Math.round(o.w * 1.34),
    x: pts[i]![0],
    y: pts[i]![1],
    transform: `translate(-50%,-50%) rotate(${o.rot}deg)`,
    opacity: 1,
    z: 2 + i,
    border: '1px solid rgba(177,199,193,0.14)',
  }))
}
