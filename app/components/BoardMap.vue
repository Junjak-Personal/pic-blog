<script setup lang="ts">
import MapFrame from '~/components/MapFrame.vue'
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

/** 캔버스는 MapFrame 이 갖는다 — 껍데기(스켈레톤·폴백·마커 z-index 가둠)를 함께 받는다 */
const frame = useTemplateRef<InstanceType<typeof MapFrame>>('frame')
const container = computed(() => frame.value?.canvas ?? null)

/** 지도가 죽었을 때 대신 세울 목록 — 살아 있는 prop 이라 computed 로 캐시한다 */
const fallbackItems = computed(() =>
  props.points.map((p) => ({ num: String(p.num), name: p.name, lat: p.lat, lng: p.lng })),
)
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
    // 다른 지도들과 «같은» 마커다 (map.css .map-marker). sm 은 좁은 띠용 크기 변형.
    el.className = 'map-marker sm'
    el.setAttribute('aria-label', `${p.name} 포인트로`)
    el.title = p.name
    el.innerHTML = `<span class="body"></span><span class="tail"></span>`
    // 이름이 아니라 번호다 — 사용자 입력이 아니지만 innerHTML 로 붙이지 않는다
    el.querySelector('.body')!.textContent = String(p.num).padStart(2, '0')
    el.addEventListener('click', () => emit('select', p.id))
    return new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(toLngLat(p)).addTo(m)
  })
  // 포인트가 바뀌었다(자리 이동·분리·삭제) — 시야도 새로 맞춘다
  fit(false)
}

watch(status, (s) => {
  if (s === 'ready') render()
})
// points 는 부모의 computed 라 바뀔 때마다 «새 배열»이다 — deep 은 트리거를 하나도
// 더하지 못하면서 traverse 비용만 낸다
watch(() => props.points, render)
onBeforeUnmount(() => {
  for (const mk of markers) mk.remove()
})
</script>

<template>
  <MapFrame ref="frame" class="bm-wrap" :status="status" :items="fallbackItems" @retry="retry" />
</template>

<style scoped>
/* 겉모습(바탕 · overflow · 마커 z-index 가둠)은 MapFrame 이 준다 — 여기는 크기와 자리만 */
.bm-wrap {
  position: relative;
  flex: none;
  height: 190px;
  margin-bottom: 10px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
}

@media (max-width: 900px) {
  /* 아래 보드가 주인공이다 — 지도는 「어디쯤인지」만 보여주면 된다 */
  .bm-wrap { height: 150px; }
}
</style>
