<script setup lang="ts">
import { vSk } from '~/utils/img'
/**
 * 갤러리 층 1 — 스캐터 필드. 가로 스트립이 아니라 흩뿌려진 필드다.
 * 배치는 시드 기반이라 새로고침해도 흔들리지 않는다 (Math.random 금지).
 * 시드는 point.id 로 고정 — 사진이 추가돼도 기존 카드는 같은 자리에 남는다.
 * 카드 크기는 실제 필드 픽셀을 본다. 설계 상수(390×430)에 묶이면 시트가 클 때 성긴다.
 */
import type { Photo } from '#shared/types/db'
import { FIELD_DESKTOP, FIELD_MOBILE, scatter } from '#shared/utils/scatter'

const props = defineProps<{
  photos: Photo[]
  /** 시드 고정 키 */
  pointId: number
  mobile?: boolean
}>()

const emit = defineEmits<{ open: [index: number] }>()

const root = ref<HTMLElement | null>(null)
const box = ref({ w: 0, h: 0 })

const cards = computed(() => {
  const fallback = props.mobile ? FIELD_MOBILE : FIELD_DESKTOP
  const fw = box.value.w || fallback.w
  const fh = box.value.h || fallback.h
  return scatter(props.photos.length, 9301 + props.pointId * 7717, fw, fh)
})

onMounted(() => {
  const el = root.value
  if (!el) return
  const ro = new ResizeObserver((entries) => {
    const cr = entries[0]?.contentRect
    if (!cr?.width || !cr.height) return
    box.value = { w: cr.width, h: cr.height }
  })
  ro.observe(el)
  onUnmounted(() => ro.disconnect())
})
</script>

<template>
  <div ref="root" class="field">
    <button
      v-for="(photo, i) in props.photos"
      :key="photo.id"
      type="button"
      class="card"
      :style="{
        left: `${cards[i]?.x}%`,
        top: `${cards[i]?.y}%`,
        width: `${cards[i]?.w}px`,
        height: `${cards[i]?.h}px`,
        transform: cards[i]?.transform,
        opacity: cards[i]?.opacity,
        zIndex: cards[i]?.z,
        border: cards[i]?.border,
      }"
      :aria-label="`사진 ${i + 1} 확대`"
      @click="emit('open', i)"
    >
      <img v-sk class="sk" :src="photo.thumb_path" alt="" loading="lazy" decoding="async">
      <span class="mono idx">{{ i + 1 }}</span>
    </button>

    <div class="hint">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M7 10l6 0" /><path d="M10 7l0 6" /><path d="M21 21l-6 -6" /></svg>
      <span class="mono">{{ props.mobile ? '탭' : '썸네일 클릭' }} → 확대 · {{ props.photos.length }}장</span>
    </div>
  </div>
</template>

<style scoped>
.field { position: relative; width: 100%; height: 100%; min-width: 0; overflow: hidden; }

.card {
  position: absolute;
  padding: 0;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--s3);
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  transition: filter 0.14s;
}
.card:hover { filter: brightness(1.35); }
.card img { display: block; width: 100%; height: 100%; object-fit: cover; }

.idx {
  position: absolute;
  left: 5px;
  bottom: 4px;
  font-size: var(--fs-micro);
  letter-spacing: 0.04em;
  color: var(--ink);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}

.hint {
  position: absolute;
  left: 24px;
  bottom: 14px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--faint);
  pointer-events: none;
}
.hint .mono { font-size: var(--fs-2xs); }

@media (max-width: 900px) {
  /* 모바일에서는 접는다 — 세로가 부족해 스캐터 밑으로 밀려 안 보였다.
     같은 내용을 PointDetail 의 ⓘ 패널이 보여준다. */
  .hint { display: none; }
}
</style>
