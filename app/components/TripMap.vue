<script setup lang="ts">
import MapSkeleton from '~/components/MapSkeleton.vue'
/**
 * 아트보드 1b 지도 — 번호 마커 + 촬영 시각 순 파선 동선.
 *
 * 포팅 메모 (목업은 Leaflet, 구현은 Mapbox GL JS v3):
 *   - 마커는 DOM 오버레이(mapboxgl.Marker)라 라벨을 포함한 모든 지도 레이어보다 항상 위다
 *   - 동선은 GeoJSON LineString + line 레이어 2장 (글로우 + 본선). beforeId 를 주지 않아
 *     라벨 위로 올라간다 — 사용자 요청대로 라벨은 켜둔 채 마커·동선이 최상단이다
 *   - 🔴 좌표는 전부 toLngLat() 를 통과한다. lat/lng 를 그대로 넘기면 지구 반대편에 찍힌다
 */
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { FeatureCollection } from 'geojson'
import type { Point } from '#shared/types/db'
import type { PointBadge } from '#shared/utils/days'
import { boundsOf, toLngLat } from '#shared/utils/geo'
import { addRouteLayers } from '~/utils/route-style'

const props = defineProps<{
  points: Point[]
  /** 포인트 id → 번호·색·이름. 번호는 날짜마다 01 로 되돌아간다 (shared/utils/days.ts) */
  badges: Map<number, PointBadge>
  activeId: number | null
  /** 상세 시트가 지도 하단을 덮는 높이(px). 0 이면 시트가 닫힌 상태다. */
  bottomInset?: number
}>()

const emit = defineEmits<{ select: [id: number] }>()

const container = ref<HTMLElement | null>(null)
const ROUTE = 'trip-route'

const bounds = computed(() => boundsOf(props.points))
const { map, status, fit, retry } = useMapbox({
  container,
  bounds,
  padding: { top: 60, right: 380, bottom: 60, left: 60 },
  // 하단은 상세 시트가 덮으므로 로고·attribution 을 좌상단으로 옮긴다
  controlPosition: 'top-left',
})

let markers: mapboxgl.Marker[] = []

/** first_shot_at 이 null 인 포인트는 선에서 빠지고 마커만 남는다 (설계문서 §6) */
const routePoints = computed(() => props.points.filter((p) => p.first_shot_at))

function routeData(): FeatureCollection {
  const coordinates = routePoints.value.map((p) => toLngLat(p))
  return {
    type: 'FeatureCollection',
    features: coordinates.length > 1
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }]
      : [],
  }
}

function markerEl(p: Point) {
  const b = props.badges.get(p.id)
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'map-marker'
  el.dataset.id = String(p.id)
  // 날짜 색. map.css 의 .map-marker 가 이 변수를 읽는다 (마커 DOM 은 scoped 스타일 밖이다)
  if (b) el.style.setProperty('--day', b.color)
  el.setAttribute('aria-label', `${b?.label ?? ''} ${b?.name ?? '포인트'} · 사진 ${p.photos.length}장`)
  // innerHTML 에는 우리가 만든 번호만 들어간다 — 이름·제목은 setAttribute 로만 나간다
  el.innerHTML = `<span class="body">${b?.label ?? ''}</span><span class="tail"></span>`
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    emit('select', p.id)
  })
  return el
}

function clearMarkers() {
  for (const m of markers) m.remove()
  markers = []
}

function render() {
  const m = map.value
  if (!m || status.value !== 'ready') return

  const src = m.getSource(ROUTE)
  if (src && 'setData' in src) {
    src.setData(routeData())
  } else {
    m.on('zoom', paintActive)
    m.addSource(ROUTE, { type: 'geojson', data: routeData() })
    addRouteLayers(m, ROUTE, `${ROUTE}-line`)
  }

  clearMarkers()
  props.points.forEach((p) => {
    markers.push(
      new mapboxgl.Marker({ element: markerEl(p), anchor: 'bottom' })
        .setLngLat(toLngLat(p))
        .addTo(m),
    )
  })
  paintActive()
}

/** 아트보드 1d — 축소되면 번호를 접고 12px dot 으로 (마커가 겹치는 구간) */
const DOT_ZOOM = 11

function paintActive() {
  const zoomedOut = (map.value?.getZoom() ?? 99) < DOT_ZOOM
  for (const mk of markers) {
    const el = mk.getElement()
    const on = el.dataset.id === String(props.activeId)
    el.classList.toggle('on', on)
    // 활성 마커는 축소돼도 번호를 유지한다 — 어디가 선택됐는지 보여야 한다
    el.classList.toggle('dot', zoomedOut && !on)
  }
}

/** 선택된 포인트로 부드럽게 이동. 상세 시트가 가리는 만큼 오프셋을 준다. */
function focusActive() {
  const m = map.value
  if (!m || status.value !== 'ready' || props.activeId == null) return
  const p = props.points.find((x) => x.id === props.activeId)
  if (!p) return
  // 시트가 덮는 만큼 마커를 위로 민다. offset 은 "지도 컨테이너 중심으로부터의 픽셀 오프셋"이다.
  const inset = props.bottomInset ?? 0
  const h = m.getContainer().clientHeight
  const offset: [number, number] = inset > 0 ? [0, (h - inset) / 2 - h / 2] : [0, 0]

  m.easeTo({
    center: toLngLat(p),
    zoom: Math.max(m.getZoom(), 14),
    offset,
    duration: 450,
  })
}

watch(status, (s) => {
  if (s === 'ready') {
    render()
    // E2E 검증용 훅 — dev 빌드에만 실린다
    if (import.meta.dev) (window as unknown as { __tripmap?: unknown }).__tripmap = map.value
  }
})
watch(() => props.points, render)
watch(() => props.activeId, () => {
  paintActive()
  focusActive()
})
watch(() => props.bottomInset, focusActive)

defineExpose({ fit, status })
onBeforeUnmount(clearMarkers)
</script>

<template>
  <div class="wrap">
    <div ref="container" class="map" />

    <!-- 하이드레이션·초기화 동안의 빈 칸을 덮는다 — status 초기값이 loading 이라 서버 HTML 에도 실린다 -->
    <MapSkeleton v-if="status === 'loading'" />

    <MapFallback
      v-if="status === 'failed'"
      :items="props.points.map((p) => ({
        num: props.badges.get(p.id)?.label ?? '',
        name: props.badges.get(p.id)?.name ?? '포인트',
        lat: p.lat,
        lng: p.lng,
      }))"
      @retry="retry"
    />

    <div v-if="status === 'ready'" class="legend">
      <div class="chip">
        <span class="dash" />
        <span class="mono">촬영 시각 순 동선</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 그리드 아이템으로 놓이므로 relative — absolute 로 두면 흐름에서 빠져 레일이 1fr 을 먹는다 */
.wrap { position: relative; width: 100%; height: 100%; min-width: 0; overflow: hidden; background: #06070A;
  /* 마커의 z-index 가 루트로 새어 나가 라이트박스·시트 위에 그려지는 걸 막는다 */
  isolation: isolate; }
.map { position: absolute; inset: 0; }

.legend {
  position: absolute;
  left: 20px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  z-index: 2;
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
.chip .mono { font-size: 10px; letter-spacing: 0.1em; color: var(--mid); }
/* 지도의 동선 레이어와 같은 색이어야 범례 구실을 한다 (--route, route-style.ts 가 SSOT) */
.dash { width: 26px; height: 0; border-top: 2px dashed var(--route); }

@media (max-width: 900px) {
  .legend { display: none; }
}
</style>
