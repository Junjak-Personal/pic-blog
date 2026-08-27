<script setup lang="ts">
import { vSk } from '~/utils/img'
/**
 * 갤러리 층 2 — 라이트박스가 캐러셀이다 (아트보드 1b).
 * 헤더: 파일명 · 8 / 14 · 포인트명 · 시각 · 닫기
 * 스와이프·핀치 확대(Swiper Zoom)가 주 조작이고, 좌우 ‹ › 와 키보드 ←/→ 도 받는다.
 * 배경에 스캐터가 흐리게 비친다.
 * Reka DialogRoot 가 포커스 트랩·ESC·스크롤 잠금을 맡는다.
 */
import { Keyboard, Zoom } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/vue'
import type { Swiper as SwiperClass } from 'swiper/types'
import 'swiper/css'
import 'swiper/css/zoom'
import type { Photo } from '#shared/types/db'
import { formatDateTime, formatOf } from '#shared/utils/format'

const props = defineProps<{
  photos: Photo[]
  pointName: string
  /** null 이면 닫힘 */
  index: number | null
}>()

const emit = defineEmits<{ close: []; move: [index: number] }>()

const open = computed({
  get: () => props.index !== null,
  set: (v: boolean) => {
    if (!v) emit('close')
  },
})

const current = computed(() => (props.index === null ? null : props.photos[props.index] ?? null))

/** 파일명은 저장 경로에서 뽑는다 — 원본 파일명은 보관하지 않는다 */
const fileName = computed(() => current.value?.display_path.split('/').pop() ?? '')

function move(step: number) {
  if (props.index === null || !props.photos.length) return
  const next = (props.index + step + props.photos.length) % props.photos.length
  emit('move', next)
}

/*
 * 확대·스와이프는 Swiper 의 Zoom 모듈이 맡는다.
 * 손으로 짜면 핀치 배율·팬 경계·더블탭·「스와이프인지 팬인지」 판별에서 버그가 난다 —
 * 확대된 상태에서 옆으로 끌면 슬라이드가 넘어가면 안 되고 사진이 움직여야 하는데,
 * 그 경계 처리가 특히 까다롭다.
 */
const swiper = shallowRef<SwiperClass | null>(null)

function onSwiper(sw: SwiperClass) {
  swiper.value = sw
}

/** 슬라이드가 바뀌면 부모의 index 와 맞춘다 (헤더의 「3 / 5」와 파일명이 따라간다) */
function onSlideChange(sw: SwiperClass) {
  if (props.index !== null && sw.activeIndex !== props.index) emit('move', sw.activeIndex)
}

/**
 * 휠 확대. Swiper 의 mousewheel 모듈은 «슬라이드 이동»이라 여기서는 쓰지 않는다.
 *
 * zoom.in() 은 배율 인자를 받지 않고 maxRatio 로 한 번에 간다 — 그래서 휠은
 * 「최대 ↔ 원본」 토글처럼 동작한다. 연속적인 배율 조절은 핀치가 맡는다
 * (Swiper Zoom 이 제대로 처리하는 영역이고, 그게 모바일의 주 조작이다).
 */
function onWheel(e: WheelEvent) {
  const sw = swiper.value
  if (!sw?.zoom) return
  e.preventDefault()
  if (e.deltaY < 0) sw.zoom.in()
  else sw.zoom.out()
}

function onKey(e: KeyboardEvent) {
  if (props.index === null) return
  if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
  if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// 부모가 index 를 바꾸면(레일 클릭 등) 캐러셀도 따라간다
watch(() => props.index, (i) => {
  if (i !== null && swiper.value && swiper.value.activeIndex !== i) swiper.value.slideTo(i, 0)
})
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <!-- 배경에 스캐터가 흐리게 비친다 -->
      <DialogOverlay class="overlay" />
      <DialogContent class="box" :aria-label="`${props.pointName} 사진 확대`">
        <DialogTitle class="sr-only">{{ props.pointName }} 사진 {{ (props.index ?? 0) + 1 }}</DialogTitle>

        <header class="head">
          <span class="mono name">{{ fileName }}</span>
          <span class="mono count">{{ (props.index ?? 0) + 1 }} / {{ props.photos.length }}</span>
          <span class="mono meta">{{ props.pointName }} · {{ formatDateTime(current?.shot_at ?? null) }}</span>
          <DialogClose class="close" aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
          </DialogClose>
        </header>

        <div class="stage">
          <button type="button" class="nav" aria-label="이전 사진" @click="move(-1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
          </button>

          <Swiper
            class="carousel"
            :modules="[Zoom, Keyboard]"
            :initial-slide="props.index ?? 0"
            :zoom="{ maxRatio: 4, toggle: true }"
            :keyboard="{ enabled: true }"
            :space-between="24"
            @swiper="onSwiper"
            @slide-change="onSlideChange"
            @wheel="onWheel"
          >
            <SwiperSlide v-for="(ph, i) in props.photos" :key="ph.id">
              <!-- swiper-zoom-container 안이어야 핀치·더블탭 확대가 걸린다 -->
              <div class="swiper-zoom-container">
                <img v-sk class="sk" :src="ph.display_path" :alt="`${props.pointName} 사진 ${i + 1}`">
              </div>
              <figcaption v-if="ph.w" class="mono cap">{{ ph.w }} × {{ ph.h }} {{ formatOf(ph.display_path) }}</figcaption>
            </SwiperSlide>
          </Swiper>

          <button type="button" class="nav" aria-label="다음 사진" @click="move(1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6" /></svg>
          </button>
        </div>

        <footer class="foot">
          <button type="button" class="nav sm" aria-label="이전 사진" @click="move(-1)">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
          </button>
          <span class="mono swipe">쓸어서 이동 · 두 손가락/더블탭으로 확대</span>
          <button type="button" class="nav sm" aria-label="다음 사진" @click="move(1)">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6" /></svg>
          </button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(5, 6, 9, 0.72);
  backdrop-filter: blur(10px);
}

.box {
  position: fixed;
  inset: 0;
  z-index: 61;
  display: flex;
  flex-direction: column;
  background: rgba(5, 6, 9, 0.97);
}

.head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(177, 199, 193, 0.1);
}
.name { font-size: 11px; color: var(--ink); }
.count { font-size: 11px; color: var(--faint); }
.meta { font-size: 11px; color: var(--faint); }
.close {
  margin-left: auto;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  color: var(--mid);
  cursor: pointer;
}

.stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 20px;
  min-height: 0;
}
/* Swiper 가 슬라이드 폭·전환을 잡는다. 우리는 안쪽 배치만 정한다. */
.carousel {
  flex: 1;
  height: 100%;
  min-width: 0;
}
.carousel :deep(.swiper-slide) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
/* 확대 대상은 이 컨테이너 안의 img 다 — Swiper Zoom 의 규약.
   높이를 고정하면(height) 컨테이너가 슬라이드를 꽉 채워 캡션이 저 아래로 밀린다.
   max-height 로 두면 사진 크기에 맞춰 줄어들어 캡션이 사진에 붙는다. */
.carousel :deep(.swiper-zoom-container) {
  /* Swiper 기본 CSS 가 width/height: 100% 를 준다 — auto 로 덮어야 사진 크기만큼
     줄어들고 캡션이 사진에 붙는다. max-height 만으로는 height 를 못 이긴다. */
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(100% - 30px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.carousel :deep(.swiper-zoom-container img) {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
}
.cap { font-size: 11px; color: var(--faint); }

.nav {
  width: 38px;
  height: 38px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid rgba(177, 199, 193, 0.2);
  border-radius: var(--radius);
  color: var(--mid);
  cursor: pointer;
}
.nav:hover { background: rgba(146, 178, 169, 0.14); }

.foot { display: none; }

@media (max-width: 900px) {
  .stage > .nav { display: none; }
  .stage { padding: 16px; }
  .meta { display: none; }
  .foot {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-top: 1px solid rgba(177, 199, 193, 0.1);
  }
  /* 헤더 밖 조작 요소는 44px — 하단 바의 이전/다음이 34px 이었다 */
  .nav.sm { width: 44px; height: 44px; }
  .swipe { font-size: 10px; color: var(--faint); }
}
</style>
