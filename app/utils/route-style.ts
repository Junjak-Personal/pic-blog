/**
 * 동선 파선 스타일 — TripMap(1b) 과 ClusterPreviewMap(1g) 이 공유한다.
 *
 * 색이 팔레트의 --acc(#92B2A9) 였을 때 커스텀 Mapbox 스타일(청록 계열 야간 프리셋)
 * 배경에 묻혀 보이지 않았다. 마커 테두리도 같은 --acc 라 동선인지 마커 잔상인지
 * 구분이 안 됐다. 팔레트에 없던 난색을 동선 전용으로 하나 뺀다 — 한색 일색인
 * 지도/마커와 색상환에서 반대편이라 어떤 배경에서도 분리된다.
 */
import type { Map } from 'mapbox-gl'

/** 동선 전용 난색. 마커(--ink 흰색 / --acc 세이지) 어느 상태와도 겹치지 않는다. */
export const ROUTE_COLOR = '#FFB454'

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
      'line-color': ROUTE_COLOR,
      'line-width': 2.75,
      'line-dasharray': [2, 5],
      'line-emissive-strength': 1,
    },
  })
}
