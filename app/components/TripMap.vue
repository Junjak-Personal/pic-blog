<script setup lang="ts">
import MapFrame from '~/components/MapFrame.vue'
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
import { pointThumb } from '~/utils/img'

const props = defineProps<{
  points: Point[]
  /** 포인트 id → 번호·색·이름. 번호는 날짜마다 01 로 되돌아간다 (shared/utils/days.ts) */
  badges: Map<number, PointBadge>
  activeId: number | null
  /** 상세 시트가 지도 하단을 덮는 높이(px). 0 이면 시트가 닫힌 상태다. */
  bottomInset?: number
}>()

const emit = defineEmits<{ select: [id: number] }>()

/** 캔버스는 MapFrame 이 갖는다 — 껍데기(스켈레톤·폴백·마커 z-index 가둠)를 함께 받는다 */
const frame = useTemplateRef<InstanceType<typeof MapFrame>>('frame')
const container = computed(() => frame.value?.canvas ?? null)

/** 지도가 죽었을 때 대신 세울 목록 — 살아 있는 prop 이라 computed 로 캐시한다 */
const fallbackItems = computed(() =>
  props.points.map((p) => ({
    num: props.badges.get(p.id)?.label ?? '',
    name: props.badges.get(p.id)?.name ?? '포인트',
    lat: p.lat,
    lng: p.lng,
  })),
)
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
/** 썸네일 자리를 다투는 순서 — 사진 많은 순. 화면과 무관해서 팬 해도 안 흔들린다 (paintLod) */
let byPriority: mapboxgl.Marker[] = []

/** first_shot_at 이 null 인 포인트는 선에서 빠지고 마커만 남는다 (설계문서 §6) */
const routePoints = computed(() => props.points.filter((p) => p.first_shot_at))

/*
 * 동선을 «구간»으로 쪼갠다 — 한 줄이 아니라 이웃한 두 포인트마다 한 조각.
 *
 * 전부 같은 난색 하나였을 때는 며칠에 걸친 기록에서 어디가 어느 날의 이동인지 읽히지
 * 않았다. 조각마다 날짜 색을 주면 마커와 레일의 날짜 탭이 쓰는 색과 같아져, 셋이 한
 * 범례로 묶인다.
 *
 * 🔴 조각의 색은 «출발점»의 날짜다. 자정을 넘는 이동은 어느 날에도 온전히 속하지 않는데,
 *    그때 도착점 색을 쓰면 다음 날의 선이 전날 자리에서 시작하는 것처럼 보인다.
 *    떠난 날의 마지막 이동으로 읽는 쪽이 지도에서 자연스럽다.
 */
function routeData(): FeatureCollection {
  const pts = routePoints.value
  return {
    type: 'FeatureCollection',
    features: pts.slice(1).map((to, i) => {
      const from = pts[i]!
      return {
        type: 'Feature' as const,
        properties: { color: props.badges.get(from.id)?.color ?? null },
        geometry: { type: 'LineString' as const, coordinates: [toLngLat(from), toLngLat(to)] },
      }
    }),
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

  // 대표 썸네일 — 고른 포인트 위에 뜬다. 3단계에서 지정한 사진이고, 지정이 없으면 첫 사진이다.
  // 🔴 src 는 지금 넣지 않는다. 포인트가 60개인 기록이면 열자마자 썸네일 60장을 받게 되는데,
  //    실제로 보이는 건 고른 하나뿐이다 — paintActive 가 켜지는 순간에 채운다.
  const thumb = pointThumb(p)
  if (thumb) {
    const img = document.createElement('img')
    img.className = 'shot'
    img.alt = ''
    img.decoding = 'async'
    img.dataset.src = thumb.thumb_path
    el.appendChild(img)
  }

  const body = document.createElement('span')
  body.className = 'body'
  // 번호는 날짜마다 01 로 되돌아간다 — 며칠차인지는 위의 --day 색이 말한다
  body.textContent = b?.label ?? ''
  const tail = document.createElement('span')
  tail.className = 'tail'
  el.append(body, tail)

  el.addEventListener('click', (e) => {
    e.stopPropagation()
    emit('select', p.id)
  })
  return el
}

function clearMarkers() {
  for (const m of markers) m.remove()
  markers = []
  byPriority = []
}

function render() {
  const m = map.value
  if (!m || status.value !== 'ready') return

  const src = m.getSource(ROUTE)
  if (src && 'setData' in src) {
    src.setData(routeData())
  } else {
    m.on('zoom', paintActive)
    m.on('move', scheduleLod)
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
  // 겹칠 때 남는 순서 — 사진이 많은 포인트가 그 자리를 대표할 자격이 크다
  const shots = new Map(props.points.map((p) => [String(p.id), p.photos.length]))
  byPriority = [...markers].sort(
    (a, b) => (shots.get(b.getElement().dataset.id ?? '') ?? 0) - (shots.get(a.getElement().dataset.id ?? '') ?? 0),
  )
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
    // 처음 켜질 때 한 번만 받는다. 이미 받았으면 그대로 둔다 (껐다 켤 때마다 다시 받지 않게)
    const img = on ? el.querySelector<HTMLImageElement>('img.shot') : null
    if (img && !img.src && img.dataset.src) img.src = img.dataset.src
  }
  paintLod()
}

/*
 * 대표 사진을 «자리가 있는 마커에만» 얹는다.
 *
 * 60포인트짜리 기록에서 전부 켜면 지도가 썸네일 벽이 된다. 줌 단계를 잘라 「11 이상이면
 * 전부」 같은 규칙을 두는 방법도 있지만, 같은 줌이라도 도심은 빽빽하고 이동 구간은
 * 성기다 — 줌은 밀도의 대리 지표일 뿐이다. 그래서 «실제로 겹치는가»를 화면 좌표로 직접
 * 재고, 겹치면 그 마커는 알약만 남긴다. 밀집한 곳은 대표 몇 장, 한적한 곳은 전부가 된다.
 *
 * 누가 남는가는 화면과 무관하게 정해둔다(byPriority: 활성 → 사진 많은 순 → 목록 순).
 * 자리를 먼저 잡은 쪽이 이기는 방식이라, 순서가 화면에 따라 바뀌면 팬할 때마다 켜지고
 * 꺼지는 것이 달라져 깜빡인다.
 *
 * 이미지는 켜지는 순간에 받는다 — 처음 그림에서 60장을 한꺼번에 받지 않기 위한 기존
 * 규칙(markerEl 의 🔴)을 그대로 잇는다.
 */
const SHOT_W = 56
/** 썸네일 40 + 간격 4 + 알약 26 + 꼬리 7 — map.css 의 .shown 과 함께 고쳐야 한다 */
const SHOT_H = 77
const GAP = 8

function paintLod() {
  const m = map.value
  if (!m || status.value !== 'ready') return
  const dots = m.getZoom() < DOT_ZOOM
  const box = m.getContainer()
  const w = box.clientWidth
  const h = box.clientHeight
  const taken: { l: number; r: number; t: number; b: number }[] = []

  // 활성은 .on 이 순서와 무관하게 언제나 그리므로 자리를 «맨 먼저» 잡아야 한다.
  // 남이 먼저 채우면 그 위에 활성 썸네일이 겹쳐 그려진다.
  const active = byPriority.filter((mk) => mk.getElement().classList.contains('on'))
  const rest = byPriority.filter((mk) => !mk.getElement().classList.contains('on'))

  for (const mk of [...active, ...rest]) {
    const el = mk.getElement()
    const img = el.querySelector<HTMLImageElement>('img.shot')
    // 점으로 접힌 구간에서는 아무 것도 얹지 않는다 — 12px 점 위의 썸네일은 읽히지 않는다
    if (!img || dots) {
      el.classList.remove('shown')
      continue
    }
    const on = el.classList.contains('on')
    const pt = m.project(mk.getLngLat())
    // 활성 마커의 썸네일은 더 크다(.on) — 자리도 그만큼 잡아야 옆 마커가 파고들지 않는다
    const half = (on ? 74 : SHOT_W) / 2
    const tall = on ? 96 : SHOT_H
    const q = { l: pt.x - half - GAP, r: pt.x + half + GAP, t: pt.y - tall - GAP, b: pt.y + GAP }

    // 지도 밖으로 잘리는 자리에는 얹지 않는다. 반쯤 잘린 사진은 없느니만 못하다.
    const clipped = q.l < 0 || q.r > w || q.t < 0 || q.b > h
    const hit = taken.some((t) => q.l < t.r && q.r > t.l && q.t < t.b && q.b > t.t)

    // 활성은 .on 이 이미 띄우므로 자리만 잡고 .shown 은 붙이지 않는다
    // (map.css 에서 .shown 이 뒤에 있어 붙이면 활성 썸네일이 작아진다)
    if (on) {
      taken.push(q)
      continue
    }
    const show = !clipped && !hit
    el.classList.toggle('shown', show)
    if (show) {
      taken.push(q)
      if (!img.src && img.dataset.src) img.src = img.dataset.src
    }
  }
}

/** move 는 팬 한 번에 수십 번 온다 — 프레임당 한 번으로 묶는다 */
let lodRaf = 0
function scheduleLod() {
  if (lodRaf) return
  lodRaf = requestAnimationFrame(() => {
    lodRaf = 0
    paintLod()
  })
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
  // 활성 마커는 번호 위에 썸네일(54+5px)이 더 얹힌다. 앵커를 그냥 중앙에 두면
  // 시트가 열려 좁아진 띠에서 썸네일이 지도 위쪽으로 잘려 나간다 — 그만큼 아래로 내린다.
  const lift = pointThumb(p) ? 30 : 0
  const offset: [number, number] = [0, (inset > 0 ? (h - inset) / 2 - h / 2 : 0) + lift]

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
  <MapFrame ref="frame" class="wrap" :status="status" :items="fallbackItems" @retry="retry">
    <div class="legend">
      <div class="chip">
        <span class="dash" />
        <span class="mono">촬영 시각 순 동선</span>
      </div>
    </div>
  </MapFrame>
</template>

<style scoped>
/* 그리드 아이템으로 놓이므로 relative — absolute 로 두면 흐름에서 빠져 레일이 1fr 을 먹는다 */
/* 겉모습(바탕 · overflow · 마커 z-index 가둠)은 MapFrame 이 준다 — 여기는 크기와 자리만 */
.wrap { position: relative; width: 100%; height: 100%; min-width: 0; }

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
  background: rgb(var(--s0-rgb) / 0.8);
  border: 1px solid rgb(var(--mid-rgb) / 0.16);
  border-radius: var(--radius);
  padding: 6px 10px;
}
.chip .mono { font-size: var(--fs-2xs); letter-spacing: 0.1em; color: var(--mid); }
/*
 * 파선 «모양»만 범례다. 색은 이제 날짜마다 다르므로(routeData 가 구간에 심는다) 여기서
 * 한 색을 골라 두면 그 날짜만 가리키는 것처럼 읽힌다 — 날짜 색의 범례는 레일의 날짜 탭이다.
 */
.dash { width: 26px; height: 0; border-top: 2px dashed var(--mid); }

@media (max-width: 900px) {
  .legend { display: none; }
  /*
   * Mapbox 로고·저작권은 요금제·약관상 «지울 수 없다» (설계문서 §6.3, useMapbox 주석).
   * 옮기는 것만 된다. top-left 는 데스크탑 기준으로 고른 자리다 — 거기는 하단을
   * 상세 시트가 덮으니까. 모바일은 시트가 화면을 통째로 덮으므로 지도 하단이 비어 있고,
   * 위쪽은 마커·동선이 몰리는 데다 헤더 바로 밑이라 로고가 계속 눈에 걸렸다.
   * 범례를 감춰 비워둔 그 자리로 내린다.
   */
  .map :deep(.mapboxgl-ctrl-top-left) { top: auto; bottom: 0; }
}
</style>
