/**
 * 알고리즘 자체 검증 — `node --experimental-strip-types shared/utils/__checks.ts`
 * data.js 의 실측값(설계 문서 §4.1.1 표)을 재현하는지 확인한다.
 */
import assert from 'node:assert/strict'
import { clusterAt, assignTo, GAP_MINUTES, type ClusterInput } from './cluster.ts'
import { scatter } from './scatter.ts'
import { distanceM, toLngLat } from './geo.ts'
import { formatExposure, formatGap } from './format.ts'
import { photoKey } from './photo.ts'
import { badgesOf, DAY_COLORS, groupByDay } from './days.ts'
import {
  cleanExpenses, cleanLinks, formatMoney, googleMapsUrl, isSafeUrl, linkLabel,
  parseExpenses, parseLinks, totalsOf, type PointExpense,
} from './extras.ts'

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

// ── 중복 사진 판정 키 ────────────────────────────────────────────────────
const shotA = { shotAt: '2026-08-22T10:14:48', lat: 37.763847, lng: 128.899886 }
assert.equal(
  photoKey(shotA),
  photoKey({ ...shotA }),
  '같은 촬영 시각·좌표는 같은 키여야 한다 — 파일명이 달라도 같은 사진이다',
)
assert.notEqual(
  photoKey(shotA),
  photoKey({ ...shotA, shotAt: '2026-08-22T10:14:49' }),
  '1초만 달라도 다른 사진이다',
)
assert.notEqual(
  photoKey(shotA),
  photoKey({ ...shotA, lat: 37.763848 }),
  '6자리 안쪽에서 갈리면 다른 사진이다',
)
assert.equal(
  photoKey(shotA),
  photoKey({ ...shotA, lat: 37.7638470000001 }),
  '7자리 이하의 흔들림은 같은 사진으로 본다 (서버를 거쳐 온 값과 비교하므로)',
)

// ── 기타 정보: 링크 ──────────────────────────────────────────────────────
assert.deepEqual(
  cleanLinks([{ label: '  구글 지도 ', url: ' https://a.com  ' }, { label: 'x', url: '   ' }]),
  [{ label: '구글 지도', url: 'https://a.com' }],
  '주소가 빈 줄은 버리고, 앞뒤 공백은 턴다',
)
assert.equal(isSafeUrl('https://a.com'), true)
assert.equal(isSafeUrl('http://a.com'), true)
assert.equal(isSafeUrl('javascript:alert(1)'), false, '클릭 한 번이 스크립트가 되면 안 된다')
assert.equal(isSafeUrl('data:text/html,<script>'), false)
assert.equal(isSafeUrl('a.com'), false, '스킴이 없으면 URL 이 아니다')
assert.equal(linkLabel({ label: '', url: 'https://www.google.com/maps' }), 'google.com', '이름이 없으면 도메인')
assert.equal(linkLabel({ label: ' 숙소 ', url: 'https://a.com' }), '숙소')
assert.equal(
  googleMapsUrl(37.763847, 128.899886),
  'https://www.google.com/maps/search/?api=1&query=37.763847,128.899886',
  '🔴 lat,lng 순서다 — 뒤집히면 지구 반대편이 열린다',
)

// ── 기타 정보: 소비 금액 ─────────────────────────────────────────────────
const spend: PointExpense[] = [
  { item: ' 라멘 ', amount: 1200, currency: 'JPY' },
  { item: '', amount: 0, currency: 'KRW' },
  { item: '커피', amount: 0.1 + 0.2, currency: 'USD' },
  { item: '교통', amount: 800, currency: 'JPY' },
]
const cleanedSpend = cleanExpenses(spend)
assert.equal(cleanedSpend.length, 3, '품목도 금액도 없는 줄은 버린다')
assert.equal(cleanedSpend[1]!.amount, 0.3, '부동소수 꼬리를 자른다 — 합계가 0.30000000000000004 가 되면 안 된다')
assert.deepEqual(
  totalsOf(cleanedSpend),
  [{ currency: 'JPY', amount: 2000 }, { currency: 'USD', amount: 0.3 }],
  '화폐가 다르면 섞어서 더하지 않는다',
)
assert.equal(formatMoney(12300, 'KRW'), '12,300원')
assert.equal(formatMoney(1200, 'JPY'), '1,200엔', 'Intl 의 JP¥ 대신 사용자가 쓰는 말로 적는다')

/*
 * 🔴 이 두 줄이 「저장했는데 변경 N건이 안 사라지는」 버그를 막는다.
 *    편집 화면은 clean 한 초안을, 서버는 parse 한 값을 내놓고 둘을 «문자열»로 비교한다 —
 *    키 순서가 한 곳만 달라져도 초안이 영원히 더러운 상태로 남는다.
 */
assert.equal(
  JSON.stringify(parseExpenses(JSON.stringify(cleanedSpend))),
  JSON.stringify(cleanedSpend),
  'clean → 저장 → parse 를 돌아도 문자열이 같아야 한다',
)
const cleanedLinks = cleanLinks([{ label: '구글 지도', url: 'https://a.com' }])
assert.equal(JSON.stringify(parseLinks(JSON.stringify(cleanedLinks))), JSON.stringify(cleanedLinks))

console.log('✓ cluster · scatter · geo · format · days · photo · extras checks passed')
