/**
 * 알고리즘 자체 검증 — `node --experimental-strip-types shared/utils/__checks.ts`
 * data.js 의 실측값(설계 문서 §4.1.1 표)을 재현하는지 확인한다.
 */
import assert from 'node:assert/strict'
import { clusterAt, assignTo, GAP_MINUTES, type ClusterInput } from './cluster.ts'
import { scatter } from './scatter.ts'
import { distanceM, toLngLat } from './geo.ts'
import { formatExposure, formatGap } from './format.ts'
import { badgesOf, DAY_COLORS, groupByDay } from './days.ts'

// ── 좌표 순서 — 놓치면 마커가 지구 반대편에 찍힌다 ────────────────────────
assert.deepEqual(toLngLat({ lat: 37.763847, lng: 128.899886 }), [128.899886, 37.763847])
assert.ok(Math.abs(distanceM([37.763847, 128.899886], [37.764847, 128.899886]) - 111.2) < 1)

// ── 90분 갭 규칙: 같은 자리, 다음 날 → 두 포인트 ─────────────────────────
const sameSpot: ClusterInput[] = [
  { key: 'a', lat: 37.7638, lng: 128.8998, t: Date.parse('2026-08-23T18:35:00Z') },
  { key: 'b', lat: 37.7638, lng: 128.8999, t: Date.parse('2026-08-23T18:40:00Z') },
  { key: 'c', lat: 37.7638, lng: 128.8998, t: Date.parse('2026-08-24T18:35:00Z') },
]
const gapped = clusterAt(sameSpot, 50)
assert.equal(gapped.length, 2, '90분 갭 규칙이 없으면 다음 날이 한 포인트로 합쳐진다')
assert.equal(gapped[1]!.gap, true, '거리는 반경 안이었으므로 끊긴 이유는 시간이다')
assert.ok(gapped[1]!.gapMinutes >= GAP_MINUTES)

// 시간이 붙어 있고 멀면 → 거리로 끊긴다 (gap=false)
const farApart = clusterAt(
  [
    { key: 'a', lat: 37.7638, lng: 128.8998, t: 0 },
    { key: 'b', lat: 37.8933, lng: 128.8296, t: 60_000 },
  ],
  50,
)
assert.equal(farApart.length, 2)
assert.equal(farApart[1]!.gap, false, '거리로 끊긴 경계는 gap 플래그가 서면 안 된다')

// ── centroid 드리프트: 실제 퍼짐이 R 을 넘을 수 있다 (버그 아님, §4.1.1) ──
const chain: ClusterInput[] = Array.from({ length: 6 }, (_, i) => ({
  key: `c${i}`,
  lat: 37.76 + i * 0.0001, // 약 11m 간격 — 사슬처럼 이어진다
  lng: 128.9,
  t: i * 60_000,
}))
const drifted = clusterAt(chain, 50)
assert.equal(drifted.length, 1, '사슬은 하나로 이어진다')
assert.ok(drifted[0]!.spread > 50, `퍼짐 ${drifted[0]!.spread}m — R=50 을 넘는 것이 정상`)

// ── 반경을 키우면 포인트 수가 줄어든다 (단조성) ──────────────────────────
const counts = [20, 50, 100, 200, 500].map((r) => clusterAt(chain, r).length)
assert.deepEqual(
  counts,
  [...counts].sort((a, b) => b - a),
  '반경이 커질수록 포인트 수는 줄거나 같아야 한다',
)

// ── assignTo: 기존 포인트 중심 불변 ──────────────────────────────────────
const existing = [{ id: 1, title: '월화거리', lat: 37.763847, lng: 128.899886, order_index: 0 }]
const added: ClusterInput[] = [
  { key: 'near', lat: 37.763900, lng: 128.899900, t: 0 }, // ~6m
  { key: 'far', lat: 37.800000, lng: 128.950000, t: 60_000 },
]
const res = assignTo(added, existing, 50)
assert.equal(res.joins.length, 1)
assert.equal(res.joins[0]!.shots.length, 1)
assert.equal(res.joins[0]!.point.lat, 37.763847, '기존 중심은 절대 움직이지 않는다')
assert.equal(res.news.length, 1)
assert.equal(res.joinedShots, 1)
assert.equal(res.total, 2)

// ── scatter: 결정적 — 같은 시드는 같은 배치 ──────────────────────────────
const s1 = scatter(14, 9301)
const s2 = scatter(14, 9301)
assert.deepEqual(s1, s2, '새로고침해도 스캐터 위치가 흔들리면 안 된다')
assert.notDeepEqual(scatter(14, 9302), s1, '시드가 다르면 배치도 달라야 한다')
assert.equal(s1.length, 14)
assert.ok(s1.every((c) => c.x >= 0 && c.x <= 100 && c.y >= 0 && c.y <= 100), '카드가 필드 밖으로 나가면 안 된다')
assert.ok(scatter(14, 86471).some((c) => c.opacity === 0.26), '10장 이상이면 일부가 고스트(0.26)가 된다')
assert.ok(scatter(3, 11).every((c) => c.opacity === 1), '10장 미만은 고스트 없음')
assert.equal(scatter(0, 1).length, 0)

// ── EXIF 표시형 ──────────────────────────────────────────────────────────
assert.equal(formatExposure(0.008333333), '1/120')
assert.equal(formatExposure(2), '2')
assert.equal(formatExposure(null), null)
assert.equal(formatExposure(0), null)
assert.equal(formatGap(90), '90분 공백 뒤')
assert.equal(formatGap(180), '3시간 공백 뒤')

// ── 날짜 묶기: 번호는 날짜마다 다시 시작하고 색은 날짜를 따라간다 ────────
const dayPoints = [
  { id: 1, title: null, first_shot_at: '2026-08-22T09:10:00' },
  { id: 2, title: '체크인', first_shot_at: '2026-08-22T18:40:00' },
  { id: 3, title: null, first_shot_at: '2026-08-23T08:05:00' },
  { id: 4, title: null, first_shot_at: null },
]
const days = groupByDay(dayPoints)
assert.equal(days.length, 3, '이틀 + 날짜 미상 한 묶음')
assert.deepEqual(days.map((g) => g.n), [1, 2, 0], '날짜 미상은 일차를 받지 않는다')
assert.equal(days[0]!.color, DAY_COLORS[0])
assert.notEqual(days[1]!.color, days[0]!.color, '날짜가 다르면 색도 달라야 한다')

const badges = badgesOf(days)
assert.equal(badges.get(1)!.label, '01')
assert.equal(badges.get(2)!.label, '02')
assert.equal(badges.get(3)!.label, '01', '날짜가 바뀌면 번호가 01 로 되돌아간다')
assert.equal(badges.get(1)!.name, '1일차 1번', '제목이 없으면 며칠차 몇 번인지로 채운다')
assert.equal(badges.get(2)!.name, '체크인', '제목이 있으면 그대로')
assert.equal(badges.get(3)!.color, days[1]!.color)
// 하루짜리 기록은 「1일차」를 붙일 이유가 없다
assert.equal(badgesOf(groupByDay([dayPoints[0]!])).get(1)!.name, '포인트 1')
// 7일차는 색이 한 바퀴 돌아 1일차와 같아진다 — 그때는 날짜 글자가 구분한다
const week = groupByDay(
  Array.from({ length: 7 }, (_, i) => ({ id: i, title: null, first_shot_at: `2026-08-2${i}T09:00:00` })),
)
assert.equal(week[6]!.color, week[0]!.color)

console.log('✓ cluster · scatter · geo · format · days checks passed')
