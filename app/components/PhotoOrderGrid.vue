<script setup lang="ts">
/**
 * 사진 순서 그리드 — 아트보드 1e. 5열, 첫 칸이 커버다.
 * 재정렬은 HTML5 네이티브 드래그앤드롭으로만 한다 (드래그 라이브러리를 넣지 않는다).
 * 드래그가 불가능한 입력(키보드)을 위해 핸들에 ←/→ 이동을 붙였다 — 없으면 순서 편집이
 * 마우스 전용 기능이 된다.
 */
import type { Photo } from '#shared/types/db'
import { formatTime } from '#shared/utils/format'

const props = defineProps<{
  photos: Photo[]
  /** 포스트 커버 사진 id. 이 그리드 안에 있으면 그 칸에 배지가 붙는다. */
  coverId: number | null
}>()

const emit = defineEmits<{
  reorder: [ids: number[]]
  remove: [id: number]
  add: []
}>()

const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

/** 커버는 「첫 포인트의 첫 사진」이라 모든 포인트가 커버를 갖지는 않는다 */
const holdsCover = computed(() => props.photos.some((p) => p.id === props.coverId))

function onDragStart(index: number, e: DragEvent) {
  dragIndex.value = index
  // Firefox 는 dataTransfer 에 아무것도 담기지 않으면 드래그를 시작조차 하지 않는다
  e.dataTransfer?.setData('text/plain', String(index))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(index: number, e: DragEvent) {
  if (dragIndex.value === null) return
  e.preventDefault()
  overIndex.value = index
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragEnd() {
  dragIndex.value = null
  overIndex.value = null
}

function onDrop(to: number) {
  const from = dragIndex.value
  onDragEnd()
  if (from === null) return
  move(from, to)
}

function move(from: number, to: number) {
  if (from === to || to < 0 || to >= props.photos.length) return
  const ids = props.photos.map((p) => p.id)
  const [moved] = ids.splice(from, 1)
  if (moved === undefined) return
  ids.splice(to, 0, moved)
  emit('reorder', ids)
}
</script>

<template>
  <div class="grid-wrap">
    <div class="grid-head">
      <span class="mono label">
        사진 순서 · 드래그로 이동<template v-if="holdsCover"> · 첫 칸이 커버</template>
      </span>
      <span class="mono count">{{ photos.length }}장</span>
    </div>

    <div class="scroll-y grid">
      <div
        v-for="(ph, i) in photos"
        :key="ph.id"
        class="tile"
        :class="{ dragging: dragIndex === i, over: overIndex === i && dragIndex !== i }"
        draggable="true"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @dragleave="overIndex = null"
        @drop.prevent="onDrop(i)"
        @dragend="onDragEnd"
      >
        <img class="thumb" :src="ph.thumb_path" :alt="`사진 ${i + 1}`" loading="lazy" draggable="false">

        <span class="mono ord">{{ String(i + 1).padStart(2, '0') }}</span>

        <button type="button" class="kill" :aria-label="`${i + 1}번 사진 삭제`" @click="emit('remove', ph.id)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
        </button>

        <span v-if="ph.id === coverId" class="mono cover">커버</span>

        <span class="bar">
          <span class="mono shot">{{ formatTime(ph.shot_at) || '시각 없음' }}</span>
          <button
            type="button"
            class="handle"
            :aria-label="`${i + 1}번 사진 순서 이동 — 좌우 방향키`"
            @keydown.left.prevent="move(i, i - 1)"
            @keydown.right.prevent="move(i, i + 1)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M4 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
          </button>
        </span>
      </div>

      <button type="button" class="add" @click="emit('add')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
        <span class="mono">사진 추가</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.grid-wrap { display: flex; flex-direction: column; gap: 9px; min-height: 0; }

.grid-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.label { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.count { font-size: 9.5px; color: var(--deep); }

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  align-content: start;
  min-height: 0;
}

.tile {
  position: relative;
  aspect-ratio: 4 / 3;
  /* 썸네일이 오기 전 빈 칸이 배경과 붙어버리지 않도록 아트보드의 사선 패턴을 깔아 둔다 */
  background: repeating-linear-gradient(135deg, #26262C 0 7px, #1E1E24 7px 14px);
  border: 1px solid var(--hair);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: grab;
}
.tile.dragging { opacity: 0.4; }
.tile.over { border-color: var(--acc); box-shadow: var(--focus-ring); }

.thumb { display: block; width: 100%; height: 100%; object-fit: cover; }

.ord {
  position: absolute;
  left: 6px;
  top: 6px;
  display: grid;
  place-items: center;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 6px;
  background: rgba(4, 4, 8, 0.8);
  font-size: 9.5px;
  color: var(--mid);
}

.kill {
  position: absolute;
  right: 5px;
  top: 5px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: rgba(4, 4, 8, 0.8);
  border: 1px solid var(--hair);
  color: var(--mid);
  cursor: pointer;
}
.kill:hover { background: var(--danger); border-color: var(--danger); color: var(--s0); }

.cover {
  position: absolute;
  left: 6px;
  bottom: 32px;
  background: var(--mid);
  color: var(--s0);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 8.5px;
}

.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 5px 4px 7px;
  background: rgba(4, 4, 8, 0.72);
}
.shot { font-size: 8.5px; color: var(--faint); }
.handle {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 1px solid var(--hair);
  background: rgba(146, 178, 169, 0.12);
  color: var(--deep);
  cursor: grab;
}

.add {
  aspect-ratio: 4 / 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px dashed rgba(177, 199, 193, 0.2);
  border-radius: var(--radius);
  color: var(--faint);
  font-size: 9.5px;
  cursor: pointer;
}
.add:hover { border-color: var(--acc); color: var(--mid); }

@media (max-width: 1240px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}
</style>
