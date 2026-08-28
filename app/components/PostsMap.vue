<script setup lang="ts">
import MapFrame from '~/components/MapFrame.vue'
/**
 * 아트보드 1a 상단 지도 띠 — 기록마다 마커 하나. 동선은 그리지 않는다.
 * 마커를 누르면 그 기록으로 간다. 마커 위에는 그 기록의 커버 썸네일이 붙는다.
 *
 * 🔴 fitBounds 는 «좌표»만 본다. 마커는 bottom 앵커라 그 지점에서 위로
 *    썸네일+번호+꼬리만큼 뻗는데, 그만큼 위쪽 패딩을 주지 않으면 지도 밖으로 잘린다 —
 *    실제로 운영에서 기록 하나의 마커가 띠 위로 완전히 빠져나가 있었다.
 */
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { PostSummary } from '#shared/types/db'
import { boundsOf } from '#shared/utils/geo'

const props = defineProps<{ posts: PostSummary[] }>()

/** 캔버스는 MapFrame 이 갖는다 — 껍데기(스켈레톤·폴백·마커 z-index 가둠)를 함께 받는다 */
const frame = useTemplateRef<InstanceType<typeof MapFrame>>('frame')
const container = computed(() => frame.value?.canvas ?? null)

/** center 는 이미 [lng, lat] 다 (서버에서 변환). boundsOf 는 lat/lng 객체를 받으므로 되돌린다. */
const located = computed(() => props.posts.filter((p): p is PostSummary & { center: [number, number] } => !!p.center))
const bounds = computed(() => boundsOf(located.value.map((p) => ({ lng: p.center[0], lat: p.center[1] }))))

/** 지도가 죽었을 때 대신 세울 목록 — 살아 있는 prop 이라 computed 로 캐시한다 */
const fallbackItems = computed(() =>
  located.value.map((p, i) => ({ num: String(i + 1), name: p.title, lat: p.center[1], lng: p.center[0] })),
)

/** 마커가 앵커에서 위로 뻗는 높이 — 썸네일 40 + 간격 4 + 번호 26 + 꼬리 7 */
const MARKER_UP = 77

const { map, status, retry, fit } = useMapbox({
  container,
  bounds,
  // 위쪽은 마커 높이를 넘겨야 한다 (위 주석). 좌우는 띠가 낮아 과하게 잡으면 fit 이 축소된다.
  padding: { top: MARKER_UP + 12, right: 52, bottom: 24, left: 52 },
  controlPosition: 'bottom-right',
  projection: 'mercator',
  // 목록 지도는 늘 「전부 보이는」 상태가 맞다 — 띠 높이가 바뀌면 다시 맞춘다
  refitOnResize: true,
})

let markers: mapboxgl.Marker[] = []

function render() {
  const m = map.value
  if (!m || status.value !== 'ready') return
  for (const mk of markers) mk.remove()
  markers = located.value.map((post, i) => {
    const el = document.createElement('a')
    el.className = 'map-marker shown'
    el.setAttribute('href', `/p/${post.slug}`)
    el.setAttribute('aria-label', `${post.title} · 포인트 ${post.point_count}`)

    // 커버 썸네일. 상세 지도와 달리 «항상» 띄운다 — 여기는 고르는 화면이 아니라
    // 훑는 화면이고, 기록당 마커가 하나뿐이라 겹칠 일이 적다.
    if (post.cover_thumb) {
      const img = document.createElement('img')
      img.className = 'shot'
      img.alt = ''
      img.decoding = 'async'
      img.src = post.cover_thumb
      el.appendChild(img)
    }

    const body = document.createElement('span')
    body.className = 'body'
    body.textContent = String(i + 1)
    const tail = document.createElement('span')
    tail.className = 'tail'
    el.append(body, tail)
    // 🔴 center 는 [lng, lat] 로 저장돼 있다 — 그대로 넘긴다
    return new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(post.center).addTo(m)
  })
  // 마커가 다시 그려졌다는 건 기록 목록이 바뀌었다는 뜻이다 — 시야도 새로 맞춘다
  fit(false)
}

watch(status, (s) => {
  if (s === 'ready') render()
})
watch(() => props.posts, render)
onBeforeUnmount(() => {
  for (const mk of markers) mk.remove()
})

/** 우하단 캡션 — 위도 범위 (아트보드 1a) */
const latRange = computed(() => {
  if (!located.value.length) return null
  const lats = located.value.map((p) => p.center[1])
  return `${Math.min(...lats).toFixed(1)}°–${Math.max(...lats).toFixed(1)}° N`
})
</script>

<template>
  <MapFrame ref="frame" class="wrap" :status="status" :items="fallbackItems" @retry="retry">
    <div v-if="latRange" class="badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
      <span class="mono">{{ props.posts.length }} records · {{ latRange }}</span>
    </div>
  </MapFrame>
</template>

<style scoped>
/* 겉모습(바탕 · overflow · 마커 z-index 가둠)은 MapFrame 이 준다 — 여기는 크기와 자리만 */
.wrap { position: relative; width: 100%; height: 100%; }

.badge {
  position: absolute;
  left: 22px;
  bottom: 18px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgb(var(--s0-rgb) / 0.8);
  border: 1px solid rgb(var(--mid-rgb) / 0.16);
  border-radius: var(--radius);
  padding: 5px 9px;
  pointer-events: none;
  color: var(--mid);
}
.badge .mono { font-size: var(--fs-2xs); letter-spacing: 0.12em; text-transform: uppercase; }

@media (max-width: 900px) {
  .badge { display: none; }
}
</style>
