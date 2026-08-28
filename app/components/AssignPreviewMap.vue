<script setup lang="ts">
import MapFrame from '~/components/MapFrame.vue'
/**
 * 1f 사진 추가 미리보기 지도.
 * 점 = 추가한 사진, 파선 테두리 번호 마커 = 합류하는 기존 포인트, `+` 마커 = 새로 생기는 포인트.
 * 기존 포인트 중심은 움직이지 않는다 — 그래서 뷰포트도 기존 포인트 기준으로 한 번만 맞춘다.
 */
import mapboxgl from 'mapbox-gl'
import { tokenColor } from '~/utils/route-style'
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

/** 캔버스는 MapFrame 이 갖는다 — 껍데기(스켈레톤·폴백·마커 z-index 가둠)를 함께 받는다 */
const frame = useTemplateRef<InstanceType<typeof MapFrame>>('frame')
const container = computed(() => frame.value?.canvas ?? null)

/** 지도가 죽었을 때 대신 세울 목록 — 기존 포인트 다음에 새로 생길 것을 잇는다 */
const fallbackItems = computed(() => [
  ...props.points.map((p, i) => ({ num: String(i + 1).padStart(2, '0'), name: p.title ?? `포인트 ${i + 1}`, lat: p.lat, lng: p.lng })),
  ...props.assignment.news.map((c, i) => ({ num: '+', name: `새 포인트 ${i + 1}`, lat: c.lat, lng: c.lng })),
])
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
        'circle-color': tokenColor('--acc-rgb', 0.95),
        'circle-stroke-width': 1,
        'circle-stroke-color': tokenColor('--s0-rgb', 0.7),
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
  <MapFrame ref="frame" class="wrap" :status="status" :items="fallbackItems" @retry="retry">
    <div class="legend">
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
  </MapFrame>
</template>

<style scoped>
/* 겉모습(바탕 · overflow · 마커 z-index 가둠)은 MapFrame 이 준다 — 여기는 크기와 자리만 */
.wrap { position: relative; width: 100%; height: 100%; min-width: 0; }

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
  background: rgb(var(--s0-rgb) / 0.8);
  border: 1px solid rgb(var(--mid-rgb) / 0.16);
  border-radius: var(--radius);
  padding: 6px 10px;
}
.chip .mono { font-size: var(--fs-2xs); color: var(--mid); }
.dot-sample { width: 6px; height: 6px; border-radius: 50%; background: rgb(var(--acc-rgb) / 0.95); }
.gain-sample {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: rgb(var(--acc-rgb) / 0.28);
  border: 1.5px dashed var(--acc);
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
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
  font-size: var(--fs-micro);
  font-weight: 600;
  color: var(--s0);
}
</style>

<style>
/* 1f 전용 마커 변형 — map.css 의 .map-marker 를 확장한다 */
.map-marker.gain .body {
  background: rgb(var(--acc-rgb) / 0.28);
  color: var(--ink);
  border: 1.5px dashed var(--acc);
}
.map-marker.gain .tail { border-top-color: var(--acc); }
.map-marker.fresh { z-index: 70; }
.map-marker.fresh .body {
  background: var(--acc);
  color: var(--s0);
  border: 1.5px solid var(--ink);
  transform: scale(1.1);
}
.map-marker.fresh .tail { border-top-color: var(--acc); }
</style>
