<script setup lang="ts">
/**
 * 포스트 뷰 — 아트보드 1b. 공개 경로라 절대 잠기지 않는다.
 * 지도 + 목록 → 마커 선택 → 스캐터 상세 → 사진 확대, 네 층이 한 화면에서 겹친다.
 */
import type { PostDetail } from '#shared/types/db'
import { formatKm, formatOf, formatRange } from '#shared/utils/format'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: post, error } = await useFetch<PostDetail>(() => `/api/posts/${slug.value}`)

const activeId = ref<number | null>(null)
const detailOpen = ref(false)
const stageEl = useTemplateRef<HTMLElement>('stageEl')
const stageHeight = ref(0)

/**
 * 시트 높이를 JS 가 소유한다 — CSS 에 같은 상수를 또 쓰면 지도 오프셋 계산과 어긋난다.
 * 데스크탑은 아트보드 1b 의 720px, 화면이 낮으면 80% 로 줄인다.
 */
const sheetHeight = computed(() => {
  if (!stageHeight.value) return 0
  return isMobile.value ? stageHeight.value : Math.min(720, stageHeight.value * 0.8)
})
const photoIndex = ref<number | null>(null)
const isMobile = ref(false)

const points = computed(() => post.value?.points ?? [])
const activePoint = computed(() => points.value.find((p) => p.id === activeId.value) ?? null)
const activeIndex = computed(() => points.value.findIndex((p) => p.id === activeId.value))

/** 대표 촬영 기기 — 레일 하단 표기 (아트보드 1b) */
const lead = computed(() => points.value[0]?.photos[0] ?? null)
const cameraLabel = computed(() => lead.value?.camera ?? null)
// w 는 바이트 PUT 이 채운다 — 업로드 도중에 열면 아직 0 이라 라벨을 접는다.
// 포맷은 실제 저장된 확장자에서 뽑는다 (아이폰 업로드는 JPEG 다).
/** 모바일 상단바에서 통계를 접어둔다 — 4칸이 타이틀을 밀어내 「2026.0…」 로 잘렸다 */
const showStats = ref(false)

const formatLabel = computed(() =>
  lead.value?.w ? `${Math.max(lead.value.w, lead.value.h)}px ${formatOf(lead.value.display_path) ?? ''}`.trim() : null,
)

/** 1c 「비공개 기록입니다」 — 403 이 통계와 기간을 함께 준다 */
interface PrivatePayload {
  private: true
  title: string
  point_count: number
  photo_count: number
  started_at: string | null
  ended_at: string | null
}
const privateInfo = computed<PrivatePayload | null>(() => {
  const data: unknown = error.value?.data
  if (typeof data !== 'object' || data === null) return null
  const d = data as { data?: unknown }
  const inner = d.data
  if (typeof inner !== 'object' || inner === null || !('private' in inner)) return null
  return inner as PrivatePayload
})

function syncViewport() {
  isMobile.value = window.matchMedia('(max-width: 900px)').matches
  stageHeight.value = stageEl.value?.clientHeight ?? 0
}

onMounted(async () => {
  await nextTick()
  syncViewport()
  window.addEventListener('resize', syncViewport)
})
onBeforeUnmount(() => window.removeEventListener('resize', syncViewport))

function select(id: number) {
  activeId.value = id
}

/**
 * 아트보드 1b 모바일 규칙 1 — 마커 첫 탭은 하이라이트만, 다시 탭하면 상세로.
 * 마커가 26px 라 첫 탭에서 바로 화면이 바뀌면 오탭이 잦다. 데스크탑은 한 번에 연다.
 */
function onMarker(id: number) {
  if (!isMobile.value) {
    open(id)
    return
  }
  if (activeId.value === id) open(id)
  else select(id)
}

function open(id: number) {
  activeId.value = id
  detailOpen.value = true
}

function closeDetail() {
  detailOpen.value = false
  photoIndex.value = null
}

useHead(() => ({
  title: post.value ? `${post.value.title} · pic·blog` : 'pic·blog',
}))
</script>

<template>
  <!-- 비공개 기록 (아트보드 1c) -->
  <main v-if="privateInfo" class="state">
    <span class="state-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></svg>
    </span>
    <h3>비공개 기록입니다</h3>
    <p>이 링크는 작성자가 공개로 바꾸면 열립니다. 좌표와 사진은 공개 전까지 서버에만 남습니다.</p>
    <span class="mono state-stat">
      {{ privateInfo.point_count }} 포인트 · {{ privateInfo.photo_count }}장
      <template v-if="privateInfo.started_at">
        · {{ formatRange(privateInfo.started_at, privateInfo.ended_at) }}
      </template>
    </span>
    <NuxtLink to="/" class="mono back-link">기록 목록으로</NuxtLink>
  </main>

  <!-- 없는 기록 -->
  <main v-else-if="error || !post" class="state">
    <h3>기록을 찾을 수 없습니다</h3>
    <NuxtLink to="/" class="mono back-link">기록 목록으로</NuxtLink>
  </main>

  <main v-else class="page">
    <header class="topbar">
      <div class="left">
        <NuxtLink to="/" class="back">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M5 12l6 6" /><path d="M5 12l6 -6" /></svg>
          <span class="mono">기록</span>
        </NuxtLink>
        <h1 class="title">{{ post.title }}</h1>
      </div>

      <!-- 모바일 전용: 통계는 접고 아이콘으로 연다 -->
      <button
        type="button"
        class="stats-toggle"
        :aria-expanded="showStats"
        aria-controls="post-stats"
        aria-label="기록 정보"
        @click="showStats = !showStats"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" /></svg>
      </button>

      <div id="post-stats" class="stats mono" :class="{ open: showStats }">
        <span v-if="post.started_at" class="stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" /><path d="M16 3l0 4" /><path d="M8 3l0 4" /><path d="M4 11l16 0" /></svg>
          {{ formatRange(post.started_at, post.ended_at) }}
        </span>
        <span class="stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
          {{ post.point_count }} 포인트
        </span>
        <span class="stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4" /><path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5" /></svg>
          {{ formatKm(post.distance_km) }} km
        </span>
        <span class="stat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg>
          {{ post.photo_count }}장
        </span>
      </div>
    </header>

    <div ref="stageEl" class="stage">
      <TripMap
        :points="points"
        :active-id="activeId"
        :bottom-inset="detailOpen ? sheetHeight : 0"
        @select="onMarker"
      />

      <PointRail
        class="rail safe-bottom"
        :points="points"
        :active-id="activeId"
        :camera="cameraLabel"
        :format="formatLabel"
        :mobile="isMobile"
        @select="select"
        @open="open"
      />

      <Transition name="sheet">
        <PointDetail
          v-if="detailOpen && activePoint"
          class="detail"
          :style="!isMobile && sheetHeight ? { height: `${sheetHeight}px` } : undefined"
          :point="activePoint"
          :index="activeIndex"
          :mobile="isMobile"
          @close="closeDetail"
          @open-photo="photoIndex = $event"
        />
      </Transition>
    </div>

    <PhotoLightbox
      v-if="activePoint"
      :photos="activePoint.photos"
      :point-name="activePoint.title ?? `포인트 ${activeIndex + 1}`"
      :index="photoIndex"
      @close="photoIndex = null"
      @move="photoIndex = $event"
    />
  </main>
</template>

<style scoped>
/* 지도가 주인공인 화면이라 뷰포트에 고정한다.
   min-height 만 주면 레일 13행이 stage 를 밀어올려 지도가 화면 밖으로 넘친다. */
.page {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 24px;
  border-bottom: 1px solid var(--hair);
  position: relative;
  z-index: 5;
  /*
   * standalone 은 레이아웃 뷰포트가 상태바 밑까지 올라간다. 상단바가 직접
   * 안전영역만큼 자라면서 자기 불투명 배경으로 그 구간을 덮어야 한다 —
   * 투명한 채로 두면 시스템이 그 위에 합성해 헤더가 흐려 보인다.
   * 이 선언들은 블록 끝에 있어야 위의 padding/background 단축 선언을 이긴다.
   * 브라우저에서는 인셋이 0 이라 원래 모습 그대로다.
   */
  padding-top: env(safe-area-inset-top);
  height: calc(56px + env(safe-area-inset-top));
  background: var(--s0);
}
.left { display: flex; align-items: center; gap: 18px; min-width: 0; }
.back { display: flex; align-items: center; gap: 7px; color: var(--deep); flex: none; }
.back .mono { font-size: 11px; letter-spacing: 0.08em; }
.title {
  font-size: 18px;
  letter-spacing: -0.02em;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stats { display: flex; align-items: center; gap: 16px; font-size: 11px; color: var(--deep); flex: none; }
/* 데스크탑에는 통계가 상단바에 그대로 있으므로 토글이 필요 없다 */
.stats-toggle { display: none; }
.stat { display: flex; align-items: center; gap: 6px; }
.stat svg { color: var(--faint); flex: none; }

.stage { flex: 1; position: relative; min-height: 0; display: grid; grid-template-columns: 1fr 348px; }

.rail { position: relative; z-index: 3; min-height: 0; overflow: hidden; }

.detail {
  position: absolute;
  left: 0;
  right: 348px;
  bottom: 0;
  z-index: 4;
}

.sheet-enter-active, .sheet-leave-active { transition: transform 0.28s ease, opacity 0.2s ease; }
.sheet-enter-from, .sheet-leave-to { transform: translateY(16px); opacity: 0; }

/* 빈·에러 상태 */
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px;
  text-align: center;
}
.state-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(146, 178, 169, 0.1);
  border: 1px solid var(--hair);
  color: var(--deep);
}
.state h3 { font-size: 24px; letter-spacing: -0.02em; color: var(--ink); }
.state p { max-width: 440px; font-size: 14px; line-height: 1.7; color: var(--mid); opacity: 0.85; }
.state-stat { font-size: 11px; color: var(--deep); }
.back-link {
  margin-top: 6px;
  padding: 9px 15px;
  border: 1px solid rgba(177, 199, 193, 0.2);
  border-radius: var(--radius);
  font-size: 11px;
  color: var(--mid);
}

/* 태블릿·모바일 — 세로 스택 */
@media (max-width: 900px) {
  /* 상단바는 타이틀 몫이다. 통계 4칸을 같이 두면 타이틀이 「2026.0…」 로 잘린다 —
     ⓘ 로 접어두고, 열면 상단바 아래에 한 줄로 펼친다. */
  /* 펼치면 한 줄이 늘어나므로 높이를 고정하지 않는다 — 고정하면 지도 위로 넘친다 */
  .topbar { height: auto; min-height: calc(50px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 14px 0; gap: 10px; flex-wrap: wrap; }
  .title { font-size: 15px; }
  .left { flex: 1; min-width: 0; gap: 12px; }

  .stats-toggle {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin-right: -8px;
    border: 0;
    background: none;
    color: var(--deep);
    cursor: pointer;
  }
  .stats-toggle[aria-expanded='true'] { color: var(--ink); }

  .stats {
    display: none;
    flex-basis: 100%;
    flex-wrap: wrap;
    gap: 8px 14px;
    padding: 0 0 10px;
    font-size: 10px;
  }
  .stats.open { display: flex; }
  .stat svg { display: none; }

  .stage { grid-template-columns: 1fr; grid-template-rows: 46dvh 1fr; }
  .rail { min-height: 0; }
  .detail { left: 0; right: 0; top: 0; height: auto; border-radius: 0; }
}

@media (max-width: 900px) and (min-width: 601px) {
  .stage { grid-template-rows: 52dvh 1fr; }
}
</style>
