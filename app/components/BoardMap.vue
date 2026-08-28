<script setup lang="ts">
import MapSkeleton from '~/components/MapSkeleton.vue'
/**
 * 편집 2단계 상단 지도 — 지금 «초안»의 포인트가 어디에 찍히는지 보여준다.
 *
 * 저장된 값이 아니라 초안을 그린다. 자리를 「대표 사진 자리로」 바꾸면 그 자리에서
 * 마커가 움직여야 무엇을 바꾼 건지 보인다 — 저장해야 확인되면 고르는 의미가 없다.
 *
 * 동선(선)은 그리지 않는다. 여기는 «어디에 있나»를 보는 화면이고, 순서는 아래 목록이
 * 번호로 말한다. 선까지 그리면 좁은 띠에서 마커를 덮는다.
 *
 * 🔴 좌표 순서: 초안은 lat/lng, Mapbox 는 [lng, lat] 다. toLngLat() 를 통과시킨다.
 */
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { boundsOf, toLngLat } from '#shared/utils/geo'

export interface BoardMapPoint {
  id: number
  /** 화면에 뜨는 번호 (1부터) */
  num: number
  name: string
  lat: number
  lng: number
}

const props = defineProps<{ points: BoardMapPoint[] }>()
const emit = defineEmits<{ select: [id: number] }>()

const container = ref<HTMLElement | null>(null)
const bounds = computed(() => boundsOf(props.points))

const { map, status, retry, fit } = useMapbox({
  container,
  bounds,
  // 마커가 앵커에서 위로 뻗는다 (번호 24 + 꼬리 6) — 그만큼 위를 비운다
  padding: { top: 42, right: 36, bottom: 22, left: 36 },
  controlPosition: 'bottom-right',
  projection: 'mercator',
  // 자리를 바꾸면 범위가 달라진다 — 늘 「전부 보이는」 상태가 맞다
  refitOnResize: true,
})

let markers: mapboxgl.Marker[] = []

function render() {
  const m = map.value
  if (!m || status.value !== 'ready') return
  for (const mk of markers) mk.remove()
  markers = props.points.map((p) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'bm-marker'
    el.setAttribute('aria-label', `${p.name} 포인트로`)
    el.title = p.name
    const body = document.createElement('span')
    body.className = 'bm-num'
    body.textContent = String(p.num).padStart(2, '0')
    const tail = document.createElement('span')
    tail.className = 'bm-tail'
    el.append(body, tail)
    el.addEventListener('click', () => emit('select', p.id))
    return new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(toLngLat(p)).addTo(m)
  })
  // 포인트가 바뀌었다(자리 이동·분리·삭제) — 시야도 새로 맞춘다
  fit(false)
}

watch(status, (s) => {
  if (s === 'ready') render()
})
watch(() => props.points, render, { deep: true })
onBeforeUnmount(() => {
  for (const mk of markers) mk.remove()
})
</script>

<template>
  <div class="bm-wrap">
    <div ref="container" class="bm-map" />
    <MapSkeleton v-if="status === 'loading'" />
    <MapFallback
      v-else-if="status === 'failed'"
      :items="props.points.map((p) => ({ num: String(p.num), name: p.name, lat: p.lat, lng: p.lng }))"
      @retry="retry"
    />
  </div>
</template>

<style scoped>
.bm-wrap {
  position: relative;
  flex: none;
  height: 190px;
  margin-bottom: 10px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: #06070A;
  /* 마커 z-index 가 페이지로 새지 않게 가둔다 */
  isolation: isolate;
}
.bm-map { position: absolute; inset: 0; }

@media (max-width: 900px) {
  /* 아래 보드가 주인공이다 — 지도는 「어디쯤인지」만 보여주면 된다 */
  .bm-wrap { height: 150px; }
}
</style>
