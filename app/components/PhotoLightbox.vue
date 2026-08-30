<script setup lang="ts">
import { vSk } from '~/utils/img'
/**
 * 갤러리 층 2 — 라이트박스가 캐러셀이다 (아트보드 1b).
 * 헤더: 파일명 · 8 / 14 · 포인트명 · 시각 · 닫기
 * 스와이프·핀치 확대(Swiper Zoom)가 주 조작이고, 좌우 ‹ › 와 키보드 ←/→ 도 받는다.
 * 배경에 스캐터가 흐리게 비친다.
 * Reka DialogRoot 가 포커스 트랩·ESC·스크롤 잠금을 맡는다.
 */
import { Zoom } from 'swiper/modules'
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
  /** 앞뒤 포인트 이름. null 이면 그 방향으로는 더 갈 곳이 없다 */
  prevName: string | null
  nextName: string | null
}>()

const emit = defineEmits<{ close: []; move: [index: number]; step: [dir: -1 | 1] }>()

const open = computed({
  get: () => props.index !== null,
  set: (v: boolean) => {
    if (!v) emit('close')
  },
})

const current = computed(() => (props.index === null ? null : props.photos[props.index] ?? null))

/** 파일명은 저장 경로에서 뽑는다 — 원본 파일명은 보관하지 않는다 */
const fileName = computed(() => current.value?.display_path.split('/').pop() ?? '')

/*
 * 사진의 끝에서 한 번 더 넘기면 «앞뒤 포인트»로 이어진다.
 * 예전에는 여기서 한 바퀴 돌았는데(모듈로), 그러면 14장짜리 포인트의 마지막에서
 * 다시 1장으로 돌아와 기록 전체를 사진으로 훑을 방법이 없었다.
 * 갈 곳이 없으면 버튼을 비활성으로 둔다 — 눌리는데 아무 일도 없으면 조용한 실패다.
 */
const atStart = computed(() => props.index === 0)
const atEnd = computed(() => props.index !== null && props.index === props.photos.length - 1)
const canPrev = computed(() => props.index !== null && (!atStart.value || props.prevName !== null))
const canNext = computed(() => props.index !== null && (!atEnd.value || props.nextName !== null))
const prevLabel = computed(() =>
  atStart.value && props.prevName ? `이전 포인트 ${props.prevName}` : '이전 사진',
)
const nextLabel = computed(() =>
  atEnd.value && props.nextName ? `다음 포인트 ${props.nextName}` : '다음 사진',
)

function move(step: -1 | 1) {
  if (props.index === null || !props.photos.length) return
  const next = props.index + step
  if (next >= 0 && next < props.photos.length) {
    emit('move', next)
    return
  }
  if (step === 1 ? props.nextName : props.prevName) emit('step', step)
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
 * 끝에서 한 번 더 쓸면 앞뒤 포인트로.
 *
 * Swiper 는 마지막 슬라이드에서 더 쓸어도 slideChange 를 내지 않는다 (끝이라 넘길 게 없다).
 * 그래서 touchEnd 에서 「끝에 있었는가 + 그 방향으로 얼마나 끌었는가」를 직접 본다.
 * touches.diff 는 시작점 대비 이동량이라 왼쪽으로 끌면 음수다.
 * 확대 중에는 그 제스처가 사진 «팬»이므로 건드리지 않는다.
 */
const EDGE_SWIPE_PX = 60

function onTouchEnd(sw: SwiperClass) {
  if (sw.zoom?.scale > 1) return
  const d = sw.touches.diff
  if (sw.isEnd && d < -EDGE_SWIPE_PX && props.nextName) emit('step', 1)
  else if (sw.isBeginning && d > EDGE_SWIPE_PX && props.prevName) emit('step', -1)
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

/*
 * 키보드 ←/→ 는 «우리»가 처리한다. Swiper 의 Keyboard 모듈은 쓰지 않는다 —
 * 둘 다 켜두면 한 번 눌러도 두 칸씩 넘어갔다 (1/5 에서 → 를 누르면 3/5).
 * 게다가 Swiper 쪽은 슬라이드 안에서만 움직여 끝에서 앞뒤 «포인트»로 넘어가지 못한다.
 */
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

/*
 * 포인트가 바뀌면 슬라이드 «목록» 자체가 갈린다. index 만 보고 있으면 놓치는 경우가 있다 —
 * 5장짜리의 마지막(4)에서 이전 포인트의 마지막(역시 4)으로 가면 index 가 안 바뀐다.
 * 목록이 갈릴 때 Swiper 에 알리고 자리를 다시 잡아준다.
 */
watch(() => props.photos, async () => {
  await nextTick()
  const sw = swiper.value
  if (!sw || props.index === null) return
  sw.update()
  sw.slideTo(props.index, 0)
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
          <span class="mono meta">{{ props.pointName }}</span>
          <DialogClose class="close" aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
          </DialogClose>
        </header>

        <div class="stage">
          <button type="button" class="nav" :aria-label="prevLabel" :title="prevLabel" :disabled="!canPrev" @click="move(-1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
          </button>

          <Swiper
            class="carousel"
            :modules="[Zoom]"
            :initial-slide="props.index ?? 0"
            :zoom="{ maxRatio: 4, toggle: true }"
            :space-between="24"
            @swiper="onSwiper"
            @slide-change="onSlideChange"
            @touch-end="onTouchEnd"
            @wheel="onWheel"
          >
            <SwiperSlide v-for="(ph, i) in props.photos" :key="ph.id">
              <!-- swiper-zoom-container 안이어야 핀치·더블탭 확대가 걸린다 -->
              <div class="swiper-zoom-container">
                <img v-sk class="sk" :src="ph.display_path" :alt="`${props.pointName} 사진 ${i + 1}`">
              </div>
              <!-- 사진 밑 한 줄에 「언제」와 「무엇」을 양 끝으로 나눈다 —
                   시각은 보는 사람의 값이고 크기·포맷은 파일의 값이라 섞으면 둘 다 안 읽힌다 -->
              <figcaption class="mono cap">
                <span class="cap-when">{{ formatDateTime(ph.shot_at) }}</span>
                <span v-if="ph.w" class="cap-size">{{ ph.w }} × {{ ph.h }} {{ formatOf(ph.display_path) }}</span>
              </figcaption>
            </SwiperSlide>
          </Swiper>

          <button type="button" class="nav" :aria-label="nextLabel" :title="nextLabel" :disabled="!canNext" @click="move(1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6" /></svg>
          </button>
        </div>

        <footer class="foot">
          <button type="button" class="nav sm" :aria-label="prevLabel" :disabled="!canPrev" @click="move(-1)">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
          </button>
          <!-- 경계에서는 다음 «포인트»가 어디인지 이름으로 말한다 — 말없이 넘어가면 어디로 간 건지 모른다 -->
          <span v-if="atEnd && props.nextName" class="mono swipe edge">쓸어서 다음 포인트 ▸ {{ props.nextName }}</span>
          <span v-else-if="atStart && props.prevName" class="mono swipe edge">◂ 쓸어서 이전 포인트 {{ props.prevName }}</span>
          <span v-else class="mono swipe">쓸어서 이동 · 두 손가락/더블탭으로 확대</span>
          <button type="button" class="nav sm" :aria-label="nextLabel" :disabled="!canNext" @click="move(1)">
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
  background: rgb(var(--s0-rgb) / 0.72);
  backdrop-filter: blur(10px);
}

.box {
  position: fixed;
  inset: 0;
  z-index: 61;
  display: flex;
  flex-direction: column;
  background: rgb(var(--s0-rgb) / 0.97);
}

.head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid rgb(var(--mid-rgb) / 0.1);
}
.name { font-size: var(--fs-xs); color: var(--ink); }
.count { font-size: var(--fs-xs); color: var(--faint); }
.meta { font-size: var(--fs-xs); color: var(--faint); }
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
  border: 1px solid rgb(var(--mid-rgb) / 0.16);
  border-radius: var(--radius);
}
/* 사진 폭에 맞춰 양 끝 정렬 — 왼쪽은 촬영 시각, 오른쪽은 크기·포맷 */
.cap {
  align-self: stretch;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px;
  font-size: var(--fs-xs);
  color: var(--faint);
}
.cap-when { color: var(--deep); }

.nav {
  width: 38px;
  height: 38px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  color: var(--mid);
  cursor: pointer;
}
.nav:hover:not(:disabled) { background: rgb(var(--acc-rgb) / 0.14); }
/* 갈 곳이 없을 때 — 눌리는데 아무 일도 없는 것보다 낫다 */
.nav:disabled { opacity: 0.3; cursor: default; }

.foot { display: none; }

@media (max-width: 900px) {
  .stage > .nav { display: none; }
  .stage { padding: 16px; }
  /* 포인트 이름은 시트 헤더가 이미 말하고 있다 — 좁은 헤더에서는 뺀다.
     파일명·번호는 남는다. 촬영 시각은 사진 밑 캡션이 맡는다. */
  .meta { display: none; }
  .foot {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-top: 1px solid rgb(var(--mid-rgb) / 0.1);
  }
  /* 헤더 밖 조작 요소는 44px — 하단 바의 이전/다음이 34px 이었다 */
  .nav.sm { width: 44px; height: 44px; }
  .swipe { font-size: var(--fs-2xs); color: var(--faint); text-align: center; }
  .swipe.edge { color: var(--mid); }
}
</style>
