<script setup lang="ts">
/**
 * 갤러리 층 2 — 라이트박스가 캐러셀이다 (아트보드 1b).
 * 헤더: 파일명 · 8 / 14 · 포인트명 · 시각 · 닫기
 * 좌우 ‹ › 순차 이동, 키보드 ←/→ 도 받는다. 배경에 스캐터가 흐리게 비친다.
 * Reka DialogRoot 가 포커스 트랩·ESC·스크롤 잠금을 맡는다.
 */
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

function onKey(e: KeyboardEvent) {
  if (props.index === null) return
  if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
  if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
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

          <figure v-if="current" class="frame">
            <img :src="current.display_path" :alt="`${props.pointName} 사진`">
            <figcaption v-if="current.w" class="mono cap">{{ current.w }} × {{ current.h }} {{ formatOf(current.display_path) }}</figcaption>
          </figure>

          <button type="button" class="nav" aria-label="다음 사진" @click="move(1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6" /></svg>
          </button>
        </div>

        <footer class="foot">
          <button type="button" class="nav sm" aria-label="이전 사진" @click="move(-1)">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
          </button>
          <span class="mono swipe">← → 키로 이동</span>
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
  width: 26px;
  height: 26px;
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
.frame {
  margin: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 0;
}
.frame img {
  max-height: calc(100% - 26px);
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
  .nav.sm { width: 34px; height: 34px; }
  .swipe { font-size: 10px; color: var(--faint); }
}
</style>
