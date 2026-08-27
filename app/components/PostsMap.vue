<script setup lang="ts">
import MapSkeleton from '~/components/MapSkeleton.vue'
/**
 * 아트보드 1a 상단 지도 띠 — 기록마다 마커 하나. 동선은 그리지 않는다.
 * 마커를 누르면 그 기록으로 간다.
 */
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { PostSummary } from '#shared/types/db'
import { boundsOf } from '#shared/utils/geo'

const props = defineProps<{ posts: PostSummary[] }>()

const container = ref<HTMLElement | null>(null)

/** center 는 이미 [lng, lat] 다 (서버에서 변환). boundsOf 는 lat/lng 객체를 받으므로 되돌린다. */
const located = computed(() => props.posts.filter((p): p is PostSummary & { center: [number, number] } => !!p.center))
const bounds = computed(() => boundsOf(located.value.map((p) => ({ lng: p.center[0], lat: p.center[1] }))))

const { map, status, retry } = useMapbox({
  container,
  bounds,
  // 236px 짜리 띠라 세로 여백을 크게 잡으면 fit 이 과하게 축소된다
  padding: { top: 20, right: 48, bottom: 20, left: 48 },
  controlPosition: 'bottom-right',
  projection: 'mercator',
})

let markers: mapboxgl.Marker[] = []

function render() {
  const m = map.value
  if (!m || status.value !== 'ready') return
  for (const mk of markers) mk.remove()
  markers = located.value.map((post, i) => {
    const el = document.createElement('a')
    el.className = 'map-marker'
    el.setAttribute('href', `/p/${post.slug}`)
    el.setAttribute('aria-label', `${post.title} · 포인트 ${post.point_count}`)
    el.innerHTML = `<span class="body">${i + 1}</span><span class="tail"></span>`
    // 🔴 center 는 [lng, lat] 로 저장돼 있다 — 그대로 넘긴다
    return new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(post.center).addTo(m)
  })
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
  <div class="wrap">
    <div ref="container" class="map" />

    <!-- 하이드레이션·초기화 동안의 빈 칸을 덮는다 — status 초기값이 loading 이라 서버 HTML 에도 실린다 -->
    <MapSkeleton v-if="status === 'loading'" />

    <MapFallback
      v-if="status === 'failed'"
      :items="located.map((p, i) => ({ num: String(i + 1), name: p.title, lat: p.center[1], lng: p.center[0] }))"
      @retry="retry"
    />

    <div v-else-if="status === 'ready' && latRange" class="badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
      <span class="mono">{{ props.posts.length }} records · {{ latRange }}</span>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #06070A;
  /* 마커 z-index 가 루트로 새지 않게 가둔다 */
  isolation: isolate;
}
.map { position: absolute; inset: 0; }

.badge {
  position: absolute;
  left: 22px;
  bottom: 18px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(4, 4, 8, 0.8);
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
  padding: 5px 9px;
  pointer-events: none;
  color: var(--mid);
}
.badge .mono { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }

@media (max-width: 900px) {
  .badge { display: none; }
}
</style>
