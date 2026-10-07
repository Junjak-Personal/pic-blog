/**
 * 알고리즘 자체 검증 — `pnpm test`
 * data.js 의 실측값(설계 문서 §4.1.1 표)을 재현하는지 확인한다.
 * 여기가 깨지면 포인트가 «조용히» 다르게 묶인다.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { clusterAt, assignTo, GAP_MINUTES, type ClusterInput } from './cluster.ts'
import { scatter } from './scatter.ts'
import { distanceM, orderedRoutePhotos, routeKm, sameSpot, toLngLat } from './geo.ts'
import { formatExposure, formatGap } from './format.ts'
import { photoKey } from './photo.ts'
import { pointAnchor, representativePhoto } from './point-anchor.ts'
import { badgesOf, DAY_COLORS, groupByDay } from './days.ts'
import {
  cleanExpenses, cleanLinks, formatMoney, googleMapsUrl, isSafeUrl, linkLabel,
  parseExpenses, parseLinks, totalsOf, type PointExpense,
} from './extras.ts'
import { dayRules, parseDaySettings, tripDates, validateDaySettings } from './trip-day.ts'

/** 로컬 벽시계로 못 박는다 — dayOf 가 로컬 날짜를 보므로 UTC 리터럴로 쓰면 TZ 에 따라 결과가 갈린다 */
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime()

/** 약 11m 간격으로 사슬처럼 이어진 여섯 장 — 드리프트·단조성 검사가 같이 쓴다 */
const chain: ClusterInput[] = Array.from({ length: 6 }, (_, i) => ({
  key: `c${i}`,
  lat: 37.76 + i * 0.0001,
  lng: 128.9,
  t: i * 60_000,
}))

describe('geo', () => {
  it('좌표 순서 — 놓치면 마커가 지구 반대편에 찍힌다', () => {
    assert.deepEqual(toLngLat({ lat: 37.763847, lng: 128.899886 }), [128.899886, 37.763847])
    assert.ok(Math.abs(distanceM([37.763847, 128.899886], [37.764847, 128.899886]) - 111.2) < 1)
  })

  it('「같은 자리」 허용치 — 보드의 꼬리표와 편집 화면의 「변경 N건」이 이 하나를 읽는다', () => {
    assert.ok(sameSpot({ lat: 37.763847, lng: 128.899886 }, { lat: 37.763847, lng: 128.899886 }))
    // 위도 0.000003° ≈ 0.33m — 같은 자리
    assert.ok(sameSpot({ lat: 37.763847, lng: 128.899886 }, { lat: 37.76385, lng: 128.899886 }))
    // 위도 0.00001° ≈ 1.1m — 움직인 것
    assert.ok(!sameSpot({ lat: 37.763847, lng: 128.899886 }, { lat: 37.763857, lng: 128.899886 }))
  })

  it('같은 포인트에 묶인 사진도 이동과 복귀를 모두 경로에 남긴다', () => {
    const photos = [
      { id: 1, lat: 37, lng: 128, shot_at: '2026-08-23T09:00:00' },
      { id: 2, lat: 37.002, lng: 128, shot_at: '2026-08-23T09:10:00' },
      { id: 3, lat: 37, lng: 128, shot_at: '2026-08-23T09:20:00' },
    ]
    const clusters = clusterAt(photos.map((photo, i) => ({
      key: String(photo.id), lat: photo.lat, lng: photo.lng, t: at(2026, 8, 23, 9, i * 10),
    })), 500)
    assert.equal(clusters.length, 1, '세 사진은 같은 포인트에 묶인다')
    assert.deepEqual(orderedRoutePhotos(photos).map(toLngLat), [[128, 37], [128, 37.002], [128, 37]])
    assert.equal(routeKm(orderedRoutePhotos(photos)), 0.4, '대표 포인트 하나의 거리 0 대신 왕복 이동을 합산한다')
  })

  it('포인트와 사진 표시 순서가 섞여도 모든 사진을 촬영 시각순으로 잇는다', () => {
    const points = [
      { photos: [
        { id: 3, point_id: 1, order_index: 0, lat: 37.002, lng: 128, shot_at: '2026-08-23T11:00:00' },
        { id: 1, point_id: 1, order_index: 1, lat: 37, lng: 128, shot_at: '2026-08-23T09:00:00' },
      ] },
      { photos: [
        { id: 2, point_id: 2, order_index: 0, lat: 37.001, lng: 128, shot_at: '2026-08-23T10:00:00' },
      ] },
    ]
    const photos = points.flatMap((point) => point.photos)
    const ordered = orderedRoutePhotos(photos)
    assert.deepEqual(ordered.map((photo) => photo.id), [1, 2, 3])
    assert.deepEqual(ordered.map((photo) => photo.point_id), [1, 2, 1], '포인트를 오간 순서도 유지한다')
    assert.deepEqual(photos.map((photo) => photo.id), [3, 1, 2], '사진 표시 순서는 바꾸지 않는다')
    assert.equal(routeKm(ordered), 0.2)
  })

  it('촬영 시각이 같으면 사진 ID 순서로 안정적으로 잇는다', () => {
    const photos = [5, 2, 9].map((id) => ({ id, lat: 37, lng: 128, shot_at: '2026-08-23T09:00:00' }))
    assert.deepEqual(orderedRoutePhotos(photos).map((photo) => photo.id), [2, 5, 9])
    assert.deepEqual(orderedRoutePhotos([...photos].reverse()), orderedRoutePhotos(photos))
  })

  it('촬영 시각이 없으면 경로에서 빼고, 사진이 없거나 한 장이면 거리는 0이다', () => {
    const photos = [
      { id: 1, lat: 37, lng: 128, shot_at: null },
      { id: 2, lat: 37.001, lng: 128, shot_at: '' },
      { id: 3, lat: 37.002, lng: 128, shot_at: '2026-08-23T09:00:00' },
    ]
    assert.deepEqual(orderedRoutePhotos(photos).map((photo) => photo.id), [3])
    assert.deepEqual(orderedRoutePhotos([]), [])
    assert.equal(routeKm([]), 0)
    assert.equal(routeKm(orderedRoutePhotos(photos)), 0)
  })
})

describe('point-anchor', () => {
  it('포인트 위치: 대표 사진 기본, 기존 위치 보존, 한 장으로 줄었을 때 정리', () => {
    const anchorPhotos = [{ id: 1, lat: 36, lng: 128 }, { id: 2, lat: 38, lng: 130 }]
    const savedAnchor = { lat: 37, lng: 129 }
    assert.deepEqual(pointAnchor(anchorPhotos, null, null, null), { lat: 36, lng: 128 })
    assert.deepEqual(pointAnchor(anchorPhotos, 2, null, null), { lat: 38, lng: 130 })
    assert.deepEqual(pointAnchor(anchorPhotos, 2, savedAnchor, null), savedAnchor, '기존 위치를 열기만 해서는 바꾸지 않는다')
    assert.deepEqual(pointAnchor(anchorPhotos, 2, savedAnchor, 'cover'), { lat: 38, lng: 130 })
    assert.deepEqual(pointAnchor(anchorPhotos, 2, null, 'centroid'), savedAnchor, '새 포인트도 평균을 명시적으로 고를 수 있다')
    assert.deepEqual(pointAnchor([anchorPhotos[1]!], 1, savedAnchor, 'centroid'), { lat: 38, lng: 130 }, '한 장만 남으면 그 사진 위치다')
    assert.deepEqual(representativePhoto(anchorPhotos, 999), anchorPhotos[0], '옮겨진 대표 사진은 현재 첫 사진으로 대체한다')
    assert.equal(pointAnchor([], null, savedAnchor, 'cover'), null)
  })
})

describe('cluster', () => {
  it('날짜 경계: 같은 자리, 다음 날 → 두 포인트', () => {
    const sameSpotShots: ClusterInput[] = [
      { key: 'a', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 18, 35) },
      { key: 'b', lat: 37.7638, lng: 128.8999, t: at(2026, 8, 23, 18, 40) },
      { key: 'c', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 24, 18, 35) },
    ]
    const gapped = clusterAt(sameSpotShots, 50)
    assert.equal(gapped.length, 2, '다음 날은 같은 자리라도 다른 포인트다')
    assert.equal(gapped[1]!.dayBreak, true, '끊긴 이유는 날짜다')
    assert.equal(gapped[1]!.gap, false, '날짜가 이유일 때 시간 갭 플래그까지 서면 화면이 거짓말한다')
    assert.ok(gapped[1]!.gapMinutes >= GAP_MINUTES)

    // 자정 경계 — 30분 갭이라 90분 규칙은 못 잡는다. 날짜가 잡아야 한다.
    const midnight = clusterAt(
      [
        { key: 'a', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 23, 50) },
        { key: 'b', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 24, 0, 20) },
      ],
      50,
    )
    assert.equal(midnight.length, 2, '자정을 넘으면 30분 갭이라도 포인트가 갈린다')
    assert.equal(midnight[1]!.dayBreak, true)
    assert.ok(midnight[1]!.gapMinutes < GAP_MINUTES, '이 경계는 90분 규칙이 못 잡는 자리다')

    // 같은 날 · 같은 자리 · 짧은 간격은 그대로 한 포인트다 (날짜 규칙이 과잉 분할하면 안 된다)
    assert.equal(
      clusterAt(
        [
          { key: 'a', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 9, 0) },
          { key: 'b', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 9, 30) },
        ],
        50,
      ).length,
      1,
      '같은 날 30분 간격은 한 포인트여야 한다',
    )

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
  })

  it('centroid 드리프트: 실제 퍼짐이 R 을 넘을 수 있다 (버그 아님, §4.1.1)', () => {
    const drifted = clusterAt(chain, 50)
    assert.equal(drifted.length, 1, '사슬은 하나로 이어진다')
    assert.ok(drifted[0]!.spread > 50, `퍼짐 ${drifted[0]!.spread}m — R=50 을 넘는 것이 정상`)
    assert.deepEqual(
      { lat: drifted[0]!.lat, lng: drifted[0]!.lng },
      { lat: chain[0]!.lat, lng: chain[0]!.lng },
      '합류는 평균으로 판정하고 확정 위치는 대표 사진을 쓴다',
    )
    assert.equal(clusterAt([...chain].reverse(), 50)[0]!.lat, chain[0]!.lat, '입력 순서가 바뀌어도 촬영 시각 순 첫 사진이 대표다')
  })

  it('반경을 키우면 포인트 수가 줄어든다 (단조성)', () => {
    const counts = [20, 50, 100, 200, 500].map((r) => clusterAt(chain, r).length)
    assert.deepEqual(
      counts,
      [...counts].sort((a, b) => b - a),
      '반경이 커질수록 포인트 수는 줄거나 같아야 한다',
    )
  })

  it('assignTo: 기존 포인트 중심 불변', () => {
    const existing = [
      { id: 1, title: '월화거리', lat: 37.763847, lng: 128.899886, order_index: 0, first_shot_at: '2026-08-23T09:00:00' },
    ]
    const added: ClusterInput[] = [
      { key: 'near', lat: 37.763900, lng: 128.899900, t: at(2026, 8, 23, 10, 0) }, // ~6m · 같은 날
      { key: 'far', lat: 37.800000, lng: 128.950000, t: at(2026, 8, 23, 10, 1) },
    ]
    const res = assignTo(added, existing, 50)
    assert.equal(res.joins.length, 1)
    assert.equal(res.joins[0]!.shots.length, 1)
    assert.equal(res.joins[0]!.point.lat, 37.763847, '기존 중심은 절대 움직이지 않는다')
    assert.equal(res.news.length, 1)
    assert.equal(res.joinedShots, 1)
    assert.equal(res.total, 2)

    // 같은 자리(~6m) 라도 «다른 날»이면 합류하지 않고 새 포인트가 된다
    const nextDay = assignTo([{ key: 'd2', lat: 37.763900, lng: 128.899900, t: at(2026, 8, 24, 10, 0) }], existing, 50)
    assert.equal(nextDay.joins.length, 0, '다른 날 사진이 어제 포인트에 합류하면 안 된다')
    assert.equal(nextDay.news.length, 1, '다른 날은 새 포인트로 선다')

    // 가장 가까운 것이 다른 날이어도, 반경 안의 «같은 날» 포인트를 놓치면 안 된다
    const twoDays = assignTo(
      [{ key: 'x', lat: 37.763900, lng: 128.899900, t: at(2026, 8, 24, 10, 0) }],
      [
        ...existing,
        { id: 2, title: null, lat: 37.763890, lng: 128.899890, order_index: 1, first_shot_at: '2026-08-24T09:00:00' },
      ],
      50,
    )
    assert.equal(twoDays.joins.length, 1)
    assert.equal(twoDays.joins[0]!.point.id, 2, '날짜가 맞는 포인트로 가야 한다')

    // 날짜를 모르는 포인트(사진이 없거나 shot_at 이 없는)는 막지 않는다
    const undated = assignTo(
      [{ key: 'y', lat: 37.763900, lng: 128.899900, t: at(2026, 8, 24, 10, 0) }],
      [{ id: 3, title: null, lat: 37.763847, lng: 128.899886, order_index: 0, first_shot_at: null }],
      50,
    )
    assert.equal(undated.joins.length, 1, '날짜를 모르는 포인트는 막을 근거가 없다')
  })
})

describe('trip-day', () => {
  /** 1일차(8/22)가 다음 날 02:00 까지, 2일차(8/23)는 공백 240분 */
  const rules = dayRules([
    { date: '2026-08-22', endTime: '02:00' },
    { date: '2026-08-23', gapMinutes: 240 },
  ])

  it('일차 경계: 지정이 없으면 자정, 지정하면 다음 날 그 시각까지 전날 일차', () => {
    const plain = dayRules()
    assert.equal(plain.dayOfIso('2026-08-23T01:00:00'), '2026-08-23', '지정 없음 = 달력 날짜 그대로')
    assert.equal(rules.dayOfIso('2026-08-22T23:40:00'), '2026-08-22')
    assert.equal(rules.dayOfIso('2026-08-23T01:00:00'), '2026-08-22', '02:00 전의 새벽은 전날 일차다')
    assert.equal(rules.dayOfIso('2026-08-23T02:00:00'), '2026-08-23', '경계 시각부터는 다음 일차다')
    assert.equal(rules.dayOfIso('2026-08-24T01:00:00'), '2026-08-24', '2일차는 끝을 안 미뤘으니 자정에 넘어간다')
    assert.equal(rules.dayOf(at(2026, 8, 23, 1, 30)), '2026-08-22', 'epoch 도 벽시계로 되돌려 같은 판정')
    assert.equal(rules.dayOfIso('2026-08-23'), '2026-08-23', '시각이 없는 값은 그 날짜 그대로')
  })

  it('묶기: 새벽 경계를 미루면 23:50 · 00:20 같은 자리가 한 포인트로 붙는다', () => {
    const late: ClusterInput[] = [
      { key: 'a', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 22, 23, 50) },
      { key: 'b', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 0, 20) },
    ]
    assert.equal(clusterAt(late, 50).length, 2, '기본은 자정에서 끊긴다')
    assert.equal(clusterAt(late, 50, rules).length, 1, '1일차가 02:00 까지면 같은 일차다')
  })

  it('묶기: 공백 기준은 일차마다 다르다', () => {
    const hotel = (d: number, h: number, m: number) => ({ key: `${d}-${h}`, lat: 37.7638, lng: 128.8998, t: at(2026, 8, d, h, m) })
    // 2시간 30분 공백 — 기본 90분이면 끊기고, 240분인 2일차에서는 붙는다
    assert.equal(clusterAt([hotel(23, 10, 0), hotel(23, 12, 30)], 50).length, 2)
    assert.equal(clusterAt([hotel(23, 10, 0), hotel(23, 12, 30)], 50, rules).length, 1)
    // 같은 공백이 1일차(기본 90분)에서는 여전히 끊긴다
    assert.equal(clusterAt([hotel(22, 10, 0), hotel(22, 12, 30)], 50, rules).length, 2)
  })

  it('사진 추가: 같은 자리 · 같은 일차여도 공백이 크면 새 포인트 (숙소 06시 · 23시)', () => {
    const hotel = { id: 1, title: '숙소', lat: 37.7638, lng: 128.8998, order_index: 0, first_shot_at: '2026-08-23T06:00:00', last_shot_at: '2026-08-23T06:10:00' }
    const night = assignTo([{ key: 'n', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 23, 0) }], [hotel], 50)
    assert.equal(night.joins.length, 0, '17시간 뒤 사진이 아침 포인트에 붙으면 안 된다')
    assert.equal(night.news.length, 1)

    const soon = assignTo([{ key: 's', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 7, 30) }], [hotel], 50)
    assert.equal(soon.joins.length, 1, '마지막 사진(06:10)에서 80분 — 공백 안이다')

    // 합류한 사진이 범위를 늘린다 — 80분씩 이어지는 사슬은 끝까지 붙는다
    const chained = assignTo(
      [
        { key: 'c1', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 7, 30) },
        { key: 'c2', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 8, 50) },
      ],
      [hotel],
      50,
    )
    assert.equal(chained.joinedShots, 2)
  })

  it('사진 추가: 새벽 경계를 미루면 다음 날 01시 사진이 전날 포인트에 합류한다', () => {
    const bar = { id: 7, title: '포장마차', lat: 37.7638, lng: 128.8998, order_index: 3, first_shot_at: '2026-08-22T23:40:00', last_shot_at: '2026-08-22T23:55:00' }
    const shot = [{ key: 'x', lat: 37.7638, lng: 128.8998, t: at(2026, 8, 23, 1, 0) }]
    assert.equal(assignTo(shot, [bar], 50).joins.length, 0, '기본은 자정에서 일차가 갈린다')
    assert.equal(assignTo(shot, [bar], 50, dayRules([{ date: '2026-08-22', endTime: '02:00', gapMinutes: 120 }])).joins.length, 1)
  })

  it('상세 일차 탭: 경계를 따라 묶는다', () => {
    const pts = [
      { id: 1, title: null, first_shot_at: '2026-08-22T20:00:00' },
      { id: 2, title: null, first_shot_at: '2026-08-23T01:00:00' },
      { id: 3, title: null, first_shot_at: '2026-08-23T09:00:00' },
    ]
    assert.deepEqual(
      groupByDay(pts).map((g) => [g.date, g.points.length]),
      [['2026-08-22', 1], ['2026-08-23', 2]],
      '기본은 새벽 01시가 다음 날 일차에 들어간다',
    )
    assert.deepEqual(
      groupByDay(pts, rules).map((g) => [g.date, g.points.length]),
      [['2026-08-22', 2], ['2026-08-23', 1]],
      '1일차가 02:00 까지면 새벽 01시는 1일차다',
    )
  })

  it('입력 검증: 기본값은 지우고, 범위 밖은 거절한다', () => {
    const ok = validateDaySettings([
      { date: '2026-08-23', endTime: '00:00', gapMinutes: 90 },
      { date: '2026-08-24', endTime: '03:30' },
      { date: '2026-08-22', gapMinutes: 180 },
    ])
    assert.deepEqual(ok, { ok: true, value: [{ date: '2026-08-22', gapMinutes: 180 }, { date: '2026-08-24', endTime: '03:30' }] }, '기본값만 든 줄은 빠지고 날짜순')
    assert.equal(validateDaySettings([{ date: '2026-08-22', endTime: '12:00' }]).ok, false, '정오부터는 다음 일차의 일정이다')
    assert.equal(validateDaySettings([{ date: '2026-08-22', endTime: '2:00' }]).ok, false)
    assert.equal(validateDaySettings([{ date: '2026-08-22', gapMinutes: 5 }]).ok, false)
    assert.equal(validateDaySettings([{ date: '2026-08-22' }, { date: '2026-08-22' }]).ok, false, '같은 날 두 줄은 어느 쪽이 맞는지 모른다')
    assert.equal(validateDaySettings('x').ok, false)
    assert.deepEqual(parseDaySettings('망가진 값'), [], 'DB 값이 망가져도 화면은 자정 경계로 산다')
  })

  it('기간의 날짜 목록', () => {
    assert.deepEqual(tripDates('2026-08-30', '2026-09-02'), ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'], '달이 바뀌어도 이어진다')
    assert.deepEqual(tripDates('2026-09-02', '2026-08-30'), [])
    assert.equal(tripDates('2026-01-01', '2026-12-31').length, 60, '상한에서 자른다')
  })
})

describe('scatter', () => {
  it('결정적 — 같은 시드는 같은 배치', () => {
    const s1 = scatter(14, 9301)
    const s2 = scatter(14, 9301)
    assert.deepEqual(s1, s2, '새로고침해도 스캐터 위치가 흔들리면 안 된다')
    assert.notDeepEqual(scatter(14, 9302), s1, '시드가 다르면 배치도 달라야 한다')
    assert.equal(s1.length, 14)
    assert.ok(s1.every((c) => c.x >= 0 && c.x <= 100 && c.y >= 0 && c.y <= 100), '카드가 필드 밖으로 나가면 안 된다')
    assert.ok(
      scatter(14, 86471).every((c) => c.opacity === 1),
      '장이 많아도 고스트로 흐리지 않는다',
    )
    assert.ok(scatter(3, 11).every((c) => c.opacity === 1))
    assert.ok(
      scatter(6, 9301, 390, 720).every((c) => c.w >= 120),
      '6장 이하는 크게 둔다',
    )
    assert.ok(
      meanW(scatter(15, 9301, 390, 720)) < meanW(scatter(6, 9301, 390, 720)) * 0.8,
      '15장은 6장보다 장수에 비례해 작아진다',
    )
    assert.ok(
      meanW(scatter(23, 9301, 390, 720)) < meanW(scatter(15, 9301, 390, 720)),
      '23장은 15장보다 더 작아진다',
    )
    assert.ok(
      maxOverlapRatio(scatter(15, 9301, 390, 720), 390, 720) <= 0.22,
      '15장 겹침은 20%를 넘기지 않는다',
    )
    assert.ok(
      maxHeavyOverlap(scatter(15, 9301, 390, 720), 390, 720) <= 3,
      '15장이 한 장 위에 쌓이면 안 된다',
    )
    const short = scatter(15, 9301, 390, 430)
    const tall = scatter(15, 9301, 390, 720)
    assert.ok(
      tall.every((c, i) => c.w > short[i]!.w),
      '필드가 커지면 카드도 커져서 빈틈을 메운다',
    )
    assert.equal(scatter(0, 1).length, 0)
  })
})

describe('format', () => {
  it('EXIF 표시형', () => {
    assert.equal(formatExposure(0.008333333), '1/120')
    assert.equal(formatExposure(2), '2')
    assert.equal(formatExposure(null), null)
    assert.equal(formatExposure(0), null)
    assert.equal(formatGap(90), '90분 공백 뒤')
    assert.equal(formatGap(180), '3시간 공백 뒤')
  })
})

describe('days', () => {
  it('날짜 묶기: 번호는 날짜마다 다시 시작하고 색은 날짜를 따라간다', () => {
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
  })
})

describe('photo', () => {
  it('중복 사진 판정 키', () => {
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
  })
})

describe('extras', () => {
  it('기타 정보: 링크', () => {
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
  })

  it('기타 정보: 소비 금액', () => {
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
  })
})

/** 장수 평균 너비 */
function meanW(cards: ReturnType<typeof scatter>) {
  return cards.reduce((s, c) => s + c.w, 0) / cards.length
}

/** 한 쌍이 겹치는 비율의 최댓값 (짧은 변 기준). */
function maxOverlapRatio(cards: ReturnType<typeof scatter>, fw: number, fh: number) {
  let max = 0
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]!
      const b = cards[j]!
      const ox =
        Math.min(a.x / 100 * fw + a.w / 2, b.x / 100 * fw + b.w / 2) -
        Math.max(a.x / 100 * fw - a.w / 2, b.x / 100 * fw - b.w / 2)
      const oy =
        Math.min(a.y / 100 * fh + a.h / 2, b.y / 100 * fh + b.h / 2) -
        Math.max(a.y / 100 * fh - a.h / 2, b.y / 100 * fh - b.h / 2)
      if (ox <= 0 || oy <= 0) continue
      const ratio = Math.min(ox / Math.min(a.w, b.w), oy / Math.min(a.h, b.h))
      if (ratio > max) max = ratio
    }
  }
  return max
}

/** 한 카드가 20% 이상 겹치는 이웃 수의 최댓값 — 스침은 무시하고 쌓임만 본다. */
function maxHeavyOverlap(cards: ReturnType<typeof scatter>, fw: number, fh: number) {
  const boxes = cards.map((c) => ({
    l: (c.x / 100) * fw - c.w / 2,
    r: (c.x / 100) * fw + c.w / 2,
    t: (c.y / 100) * fh - c.h / 2,
    b: (c.y / 100) * fh + c.h / 2,
    w: c.w,
    h: c.h,
  }))
  let max = 0
  for (let i = 0; i < boxes.length; i++) {
    let d = 0
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue
      const a = boxes[i]!
      const b = boxes[j]!
      const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l)
      const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t)
      if (ox <= 0 || oy <= 0) continue
      const ratio = Math.min(ox / Math.min(a.w, b.w), oy / Math.min(a.h, b.h))
      if (ratio >= 0.2) d++
    }
    if (d > max) max = d
  }
  return max
}
