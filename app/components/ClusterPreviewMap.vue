<script setup lang="ts">
import MapFrame from '~/components/MapFrame.vue'
/**
 * 1g 클러스터 미리보기 지도.
 * 점 = 사진 1장, 번호 마커 = 잠정 포인트, 실선 = 거리로 끊긴 경계, 점선 = 시간 공백으로 끊김.
 *
 * 🔴 좌표 순서: DB/EXIF 는 lat/lng, Mapbox 는 [lng, lat] 다.
 *    아래에서 지도로 나가는 좌표는 전부 toLngLat() 를 통과한다.
 */
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { FeatureCollection } from 'geojson'
import type { Cluster, ClusterInput } from '#shared/utils/cluster'
import { boundsOf, toLngLat } from '#shared/utils/geo'
import { addRouteLayers, tokenColor } from '~/utils/route-style'

const props = defineProps<{
  clusters: Cluster<ClusterInput>[]
  shots: ClusterInput[]
  active: string | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

/** 캔버스는 MapFrame 이 갖는다 — 껍데기(스켈레톤·폴백·마커 z-index 가둠)를 함께 받는다 */
const frame = useTemplateRef<InstanceType<typeof MapFrame>>('frame')
const container = computed(() => frame.value?.canvas ?? null)

/** 지도가 죽었을 때 대신 세울 목록 — 살아 있는 prop 이라 computed 로 캐시한다 */
const fallbackItems = computed(() =>
  props.clusters.map((c, i) => ({ num: String(i + 1).padStart(2, '0'), name: `포인트 ${i + 1}`, lat: c.lat, lng: c.lng })),
)

// 뷰포트는 사진 전체 범위로 한 번만 맞춘다. 반경을 바꿔도 다시 fitBounds 하지 않는다.
const initialBounds = computed(() => boundsOf(props.shots))
const { map, status, retry } = useMapbox({
  container,
  bounds: initialBounds,
  padding: { top: 60, right: 380, bottom: 200, left: 60 },
})

let markers: mapboxgl.Marker[] = []

const SHOT_SOURCE = 'shot-dots'
const ROUTE_SOURCE = 'cluster-route'
const GAP_SOURCE = 'cluster-gap'

function clearMarkers() {
  for (const m of markers) m.remove()
  markers = []
}

/** 클러스터 중심을 이은 선. 시간·날짜로 끊긴 구간만 따로 뺀다 — 실선으로 이으면 지도가 옆 패널과 다른 말을 한다. */
function routeFeatures() {
  const solid: [number, number][][] = []
  const gap: [number, number][][] = []
  for (let i = 1; i < props.clusters.length; i++) {
    const a = props.clusters[i - 1]!
    const b = props.clusters[i]!
    const seg: [number, number][] = [toLngLat(a), toLngLat(b)]
    ;(b.gap || b.dayBreak ? gap : solid).push(seg)
  }
  return { solid, gap }
}

function lineCollection(segments: [number, number][][]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: segments.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })),
  }
}

function render() {
  const m = map.value
  if (!m || status.value !== 'ready') return

  // 사진 점 — 113개까지 가므로 DOM 이 아니라 circle 레이어로 그린다
  const dots: FeatureCollection = {
    type: 'FeatureCollection',
    features: props.shots.map((s) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: toLngLat(s) },
    })),
  }
  setSource(m, SHOT_SOURCE, dots)

  const { solid, gap } = routeFeatures()
  setSource(m, ROUTE_SOURCE, lineCollection(solid))
  setSource(m, GAP_SOURCE, lineCollection(gap))

  clearMarkers()
  props.clusters.forEach((c, i) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'map-marker'
    el.setAttribute('aria-label', `포인트 ${i + 1} · 사진 ${c.shots.length}장`)
    el.innerHTML = `<span class="body">${String(i + 1).padStart(2, '0')}</span><span class="tail"></span>`
    if (c.gap || c.dayBreak) {
      const badge = document.createElement('span')
      badge.className = 'clock'
      badge.innerHTML =
        '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>'
      el.appendChild(badge)
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      emit('select', `c${i}`)
    })
    // 🔴 [lng, lat]
    markers.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(toLngLat(c)).addTo(m))
  })
  paintActive()
}

function paintActive() {
  markers.forEach((mk, i) => {
    mk.getElement().classList.toggle('on', props.active === `c${i}`)
  })
}

function setSource(m: mapboxgl.Map, id: string, data: FeatureCollection) {
  const existing = m.getSource(id)
  if (existing && 'setData' in existing) {
    existing.setData(data)
    return
  }
  m.addSource(id, { type: 'geojson', data })

  if (id === SHOT_SOURCE) {
    m.addLayer({
      id: `${id}-layer`,
      type: 'circle',
      source: id,
      paint: {
        'circle-radius': 2.5,
        'circle-color': tokenColor('--mid-rgb', 0.5),
        'circle-stroke-width': 1,
        'circle-stroke-color': tokenColor('--s0-rgb', 0.7),
        // night 프리셋에서 커스텀 레이어가 조명에 눌려 검게 깔린다 — route-style.ts 주석 참고
        'circle-emissive-strength': 1,
      },
    })
    return
  }

  if (id === ROUTE_SOURCE) {
    // 글로우 먼저, 그 위에 본선 — beforeId 를 주지 않아 라벨 위로 올라간다
    addRouteLayers(m, id, `${id}-layer`)
    return
  }

  // 시간 공백으로 끊긴 구간 — 더 가늘고 촘촘한 점선이라 거리로 끊긴 실선과 구분된다
  m.addLayer({
    id: `${id}-layer`,
    type: 'line',
    source: id,
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': tokenColor('--acc-rgb', 0.55),
      'line-width': 1.4,
      'line-dasharray': [1, 6],
      'line-emissive-strength': 1,
    },
  })
}

watch(status, (s) => {
  if (s === 'ready') {
    render()
    // E2E 검증용 훅 — dev 빌드에만 실린다
    if (import.meta.dev) (window as unknown as { __picmap?: unknown }).__picmap = map.value
  }
})
watch(() => props.clusters, render, { deep: false })
watch(() => props.active, paintActive)

onBeforeUnmount(clearMarkers)
</script>

<template>
  <MapFrame ref="frame" class="wrap" :status="status" :items="fallbackItems" @retry="retry">
    <div class="legend">
      <div class="chip">
        <span class="dot-sample" />
        <span class="mono">사진 1장 = 점 {{ props.shots.length }}개</span>
      </div>
      <div class="chip">
        <span class="line-sample" />
        <span class="mono">거리로 끊긴 경계</span>
      </div>
      <div class="chip accent">
        <span class="gap-sample" />
        <span class="clock-sample">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></svg>
        </span>
        <span class="mono">날짜·시간으로 끊김</span>
      </div>
    </div>
  </MapFrame>
</template>

<style scoped>
/* 겉모습(바탕 · overflow · 마커 z-index 가둠)은 MapFrame 이 준다 — 여기는 크기와 자리만.
   🔴 여기만 absolute 다 — .map-area 가 높이를 안 갖고 있어 100% 로는 0px 이 된다. */
.wrap { position: absolute; inset: 0; }

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
.chip.accent { border-color: rgb(var(--acc-rgb) / 0.4); }
.chip .mono { font-size: var(--fs-2xs); color: var(--mid); }
.dot-sample { width: 5px; height: 5px; border-radius: 50%; background: rgb(var(--mid-rgb) / 0.5); }
/* 지도의 동선 레이어와 같은 색 (--route) — .gap-sample 은 시간 공백선이라 세이지 유지 */
.line-sample { width: 26px; height: 0; border-top: 2px dashed var(--route); }
.gap-sample { width: 26px; height: 0; border-top: 1.4px dotted rgb(var(--acc-rgb) / 0.85); }
.clock-sample {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--s0);
  border: 1px solid var(--acc);
  color: var(--acc);
}

/* 390px 에서는 범례 3칩이 지도 위쪽을 통째로 덮는다. TripMap 과 같이 접는다 —
   반경 패널의 「사진 → 포인트」 수치가 같은 정보를 이미 준다. */
@media (max-width: 900px) {
  .legend { display: none; }
}
</style>
