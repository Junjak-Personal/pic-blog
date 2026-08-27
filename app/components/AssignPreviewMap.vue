<script setup lang="ts">
import MapSkeleton from '~/components/MapSkeleton.vue'
/**
 * 1f 사진 추가 미리보기 지도.
 * 점 = 추가한 사진, 파선 테두리 번호 마커 = 합류하는 기존 포인트, `+` 마커 = 새로 생기는 포인트.
 * 기존 포인트 중심은 움직이지 않는다 — 그래서 뷰포트도 기존 포인트 기준으로 한 번만 맞춘다.
 */
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { FeatureCollection } from 'geojson'
import type { Point } from '#shared/types/db'
import type { AssignResult, ClusterInput } from '#shared/utils/cluster'
import { boundsOf, toLngLat } from '#shared/utils/geo'

const props = defineProps<{
  points: Point[]
  added: ClusterInput[]
  assignment: AssignResult<ClusterInput>
}>()

const container = ref<HTMLElement | null>(null)
const DOTS = 'added-dots'

// 기존 포인트 + 추가 사진 전체를 한 번만 담는다. 반경을 바꿔도 다시 맞추지 않는다.
const initialBounds = computed(() => boundsOf([...props.points, ...props.added]))
const { map, status, retry } = useMapbox({
  container,
  bounds: initialBounds,
  padding: { top: 60, right: 380, bottom: 200, left: 60 },
  controlPosition: 'top-left',
})

let markers: mapboxgl.Marker[] = []

const gainByPoint = computed(() => {
  const m = new Map<number, number>()
  for (const j of props.assignment.joins) m.set(j.point.id, j.shots.length)
  return m
})

function clearMarkers() {
  for (const mk of markers) mk.remove()
  markers = []
}

function render() {
  const m = map.value
  if (!m || status.value !== 'ready') return

  const dots: FeatureCollection = {
    type: 'FeatureCollection',
    features: props.added.map((s) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: toLngLat(s) },
    })),
  }
  const src = m.getSource(DOTS)
  if (src && 'setData' in src) {
    src.setData(dots)
  } else {
    m.addSource(DOTS, { type: 'geojson', data: dots })
    m.addLayer({
      id: `${DOTS}-layer`,
      type: 'circle',
      source: DOTS,
      paint: {
        'circle-radius': 3,
        'circle-color': 'rgba(146,178,169,0.95)',
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(4,4,8,0.7)',
        // night 프리셋에서 커스텀 레이어가 조명에 눌려 검게 깔린다 — route-style.ts 주석 참고
        'circle-emissive-strength': 1,
      },
    })
  }

  clearMarkers()

  // 기존 포인트 — 합류가 있으면 파선 테두리로 구분한다
  props.points.forEach((p, i) => {
    const gain = gainByPoint.value.get(p.id) ?? 0
    const el = document.createElement('div')
    el.className = `map-marker${gain ? ' gain' : ''}`
    el.setAttribute('aria-label', `${p.title ?? `포인트 ${i + 1}`}${gain ? ` · +${gain}장 합류` : ''}`)
    el.innerHTML = `<span class="body">${String(i + 1).padStart(2, '0')}</span><span class="tail"></span>`
    markers.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(toLngLat(p)).addTo(m))
  })

  // 새로 생기는 포인트
  props.assignment.news.forEach((c, i) => {
    const el = document.createElement('div')
    el.className = 'map-marker fresh'
    el.setAttribute('aria-label', `새 포인트 ${i + 1} · 사진 ${c.shots.length}장`)
    el.innerHTML = `<span class="body">+</span><span class="tail"></span>`
    markers.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(toLngLat(c)).addTo(m))
  })
}

watch(status, (s) => {
  if (s === 'ready') render()
})
watch(() => props.assignment, render)
onBeforeUnmount(clearMarkers)
</script>

<template>
  <div class="wrap">
    <div ref="container" class="map" />

    <!-- 하이드레이션·초기화 동안의 빈 칸을 덮는다 — status 초기값이 loading 이라 서버 HTML 에도 실린다 -->
    <MapSkeleton v-if="status === 'loading'" />

    <MapFallback
      v-if="status === 'failed'"
      :items="[
        ...props.points.map((p, i) => ({ num: String(i + 1).padStart(2, '0'), name: p.title ?? `포인트 ${i + 1}`, lat: p.lat, lng: p.lng })),
        ...props.assignment.news.map((c, i) => ({ num: '+', name: `새 포인트 ${i + 1}`, lat: c.lat, lng: c.lng })),
      ]"
      @retry="retry"
    />

    <div v-else-if="status === 'ready'" class="legend">
      <div class="chip">
        <span class="dot-sample" />
        <span class="mono">추가한 사진 {{ props.added.length }}장</span>
      </div>
      <div class="chip">
        <span class="gain-sample">11</span>
        <span class="mono">기존 포인트에 합류</span>
      </div>
      <div class="chip">
        <span class="fresh-sample">+</span>
        <span class="mono">새로 생기는 포인트</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: #06070A;
  isolation: isolate;
}
.map { position: absolute; inset: 0; }

.legend {
  position: absolute;
  left: 20px;
  top: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.chip {
  display: flex;
  align-items: center;
  gap: 9px;
  background: rgba(4, 4, 8, 0.8);
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
  padding: 6px 10px;
}
.chip .mono { font-size: 10px; color: var(--mid); }
.dot-sample { width: 6px; height: 6px; border-radius: 50%; background: rgba(146, 178, 169, 0.95); }
.gain-sample {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: rgba(146, 178, 169, 0.28);
  border: 1.5px dashed var(--acc);
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--ink);
}
.fresh-sample {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--acc);
  border: 1.5px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  color: var(--s0);
}
</style>

<style>
/* 1f 전용 마커 변형 — map.css 의 .map-marker 를 확장한다 */
.map-marker.gain .body {
  background: rgba(146, 178, 169, 0.28);
  color: #E8EBE9;
  border: 1.5px dashed #92B2A9;
}
.map-marker.gain .tail { border-top-color: #92B2A9; }
.map-marker.fresh { z-index: 70; }
.map-marker.fresh .body {
  background: #92B2A9;
  color: #040408;
  border: 1.5px solid #E8EBE9;
  transform: scale(1.1);
}
.map-marker.fresh .tail { border-top-color: #92B2A9; }
</style>
