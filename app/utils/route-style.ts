/**
 * 동선 파선 스타일 — TripMap(1b) 과 ClusterPreviewMap(1g) 이 공유한다.
 *
 * 색이 팔레트의 --acc(#92B2A9) 였을 때 커스텀 Mapbox 스타일(청록 계열 야간 프리셋)
 * 배경에 묻혀 보이지 않았다. 마커 테두리도 같은 --acc 라 동선인지 마커 잔상인지
 * 구분이 안 됐다. 팔레트에 없던 난색을 동선 전용으로 하나 뺀다 — 한색 일색인
 * 지도/마커와 색상환에서 반대편이라 어떤 배경에서도 분리된다.
 */
import type { Map } from 'mapbox-gl'

/**
 * CSS 토큰을 지도 레이어 색으로 넘긴다.
 *
 * 🔴 Mapbox 의 paint 값은 CSS 가 아니다 — `var(--acc-rgb)` 를 넣으면 그대로 문자열로
 *    들어가 파싱에 실패한다 (색이 조용히 기본값으로 떨어진다). 그렇다고 리터럴을
 *    적으면 팔레트를 옮길 때 여기만 옛 색으로 남는다 — 실제로 그렇게 남을 뻔했다.
 *    그래서 :root 에서 채널을 «읽어» rgba() 문자열로 만들어 넘긴다.
 *    공백/슬래시 표기(rgb(r g b / a))가 아니라 rgba(r, g, b, a) 인 이유도 같다 —
 *    Mapbox 의 색 파서가 확실히 받는 형식이 이쪽이다.
 *
 * 브라우저에서만 부른다 (지도 레이어를 올리는 시점이라 언제나 클라이언트다).
 */
export function tokenColor(channel: string, alpha = 1) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(channel).trim()
  const [r, g, b] = raw.split(/\s+/)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}


/** 동선 전용 난색. 마커(--ink 흰색 / --acc 세이지) 어느 상태와도 겹치지 않는다. */
export const ROUTE_COLOR = '#FFB454'

/**
 * 날짜 색을 «동선용»으로 밝힌다 — 흰색 쪽으로 40%.
 *
 * 날짜 팔레트(DAY_COLORS)는 26px 원형 «마커»를 위해 밝기를 서로 비슷하게 맞춰 만든
 * 색이다. 그 색을 2.75px 파선에 그대로 쓰면 이 지도 배경에서 사라지는 것이 나온다.
 * 실측 luminance 로는 갈리지 않았다 — 가장 어두운 분홍(0.351)이 제일 잘 보이고
 * 세이지(0.388)·파랑(0.372)이 안 보인다. 밝기가 아니라 «배경과 같은 색 계열»이라서다
 * (지도 바탕이 탈색된 남회색이다).
 *
 * 그래서 밝기 기준으로 «골라» 올리지 않고 전부 같은 양만큼 올린다. 서로의 관계가
 * 그대로 남아야 날짜 탭·마커와 같은 색으로 읽힌다. 색상(hue)은 건드리지 않는다.
 */
export function routeDash(hex: string | undefined | null) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null
  const n = parseInt(hex.slice(1), 16)
  const up = (c: number) => Math.round(c + (255 - c) * 0.4)
  const [r, g, b] = [up(n >> 16), up((n >> 8) & 255), up(n & 255)]
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * 글로우 → 본선 순으로 2장 올린다. beforeId 를 주지 않아 라벨 위로 올라간다.
 * dash 는 [2,7] 에서 [2,5] 로 좁혔다 — 2.25px 폭에서 [2,7] 은 4.5px 점 / 15.75px 공백이라
 * 지도 위 다른 선들 사이에서 선으로 읽히지 않고 흩어진 점으로 보였다.
 *
 * 🔴 line-emissive-strength 가 이 함수에서 제일 중요한 줄이다.
 *    커스텀 스타일이 mapbox/standard 기반 + night 프리셋이라 v3 가 추가 레이어를
 *    씬 조명에 종속시킨다. 이 값이 없으면(기본 0) 야간 앰비언트에 눌려 line-color 로
 *    무슨 색을 넣든 거의 검게 깔린다 — 동선이 「묻혀 보이던」 진짜 원인이 색이 아니라
 *    조명이었다. 1 이면 조명을 무시하고 지정한 색 그대로 발광한다.
 */
export function addRouteLayers(m: Map, source: string, lineId: string) {
  m.addLayer({
    id: `${source}-glow`,
    type: 'line',
    source,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ROUTE_COLOR,
      'line-width': 9,
      'line-opacity': 0.2,
      'line-blur': 3,
      'line-emissive-strength': 1,
    },
  })
  m.addLayer({
    id: lineId,
    type: 'line',
    source,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      /*
       * 구간이 color 를 들고 있으면 그 색으로 (TripMap 이 날짜 색을 심는다).
       * 없으면 난색 하나 — 날짜 개념이 없는 화면(ClusterPreviewMap)이 그렇다.
       * 글로우는 갈라지지 않는다: 여러 색이 번지면 경계에서 탁해지고, 무엇보다
       * 「선이 거기 있다」는 신호는 색과 무관하다.
       */
      'line-color': ['coalesce', ['get', 'color'], ROUTE_COLOR],
      'line-width': 3,
      'line-dasharray': [2, 5],
      'line-emissive-strength': 1,
    },
  })
}
