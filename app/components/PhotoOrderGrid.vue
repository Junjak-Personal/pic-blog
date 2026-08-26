<script setup lang="ts">
/**
 * 사진 순서 그리드 — 아트보드 1e. 5열, 첫 칸이 커버다.
 *
 * 재정렬은 Pointer Events 로 한다. 원래 HTML5 네이티브 드래그앤드롭이었는데
 * 🔴 그건 터치 기기에서 아예 동작하지 않는다 — 아이폰에서 순서를 못 바꾸고 있었다.
 * Pointer Events 는 마우스·터치·펜이 같은 경로를 타므로 한 벌로 전부 커버된다.
 * 라이브러리는 여전히 넣지 않는다.
 *
 * 핸들의 ←/→ 이동은 그대로 둔다 — 키보드 사용자에게는 그게 유일한 경로다.
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
/** 스크롤과 구분하기 위한 임계값 — 이만큼 움직여야 드래그로 친다 */
const DRAG_SLOP = 6
let startX = 0
let startY = 0
let armed = false

/** 커버는 「첫 포인트의 첫 사진」이라 모든 포인트가 커버를 갖지는 않는다 */
const holdsCover = computed(() => props.photos.some((p) => p.id === props.coverId))

function onPointerDown(index: number, e: PointerEvent) {
  // 왼쪽 버튼·터치·펜만. 칸 안의 버튼(삭제·이동)을 누른 것이면 드래그가 아니다.
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest('button')) return
  armed = true
  startX = e.clientX
  startY = e.clientY
  dragIndex.value = index
  // 포인터를 이 요소에 묶어둔다 — 손가락이 칸을 벗어나도 이벤트가 계속 온다
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (dragIndex.value === null) return

  // 임계값을 넘기 전에는 아무것도 하지 않는다 — 세로 스크롤을 뺏으면 안 된다
  if (armed && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_SLOP) return
  armed = false

  // 포인터가 잡혀 있어 e.target 은 항상 시작 칸이다. 실제로 어느 칸 위인지는 좌표로 찾는다.
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile')
  if (!el || !el.parentElement) return
  const to = [...el.parentElement.children].indexOf(el)
  if (to >= 0 && to < props.photos.length) overIndex.value = to
}

function onPointerUp() {
  const from = dragIndex.value
  const to = overIndex.value
  onDragEnd()
  if (from !== null && to !== null) move(from, to)
}

function onDragEnd() {
  armed = false
  dragIndex.value = null
  overIndex.value = null
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
        사진 순서 · 끌어서 이동<template v-if="holdsCover"> · 첫 칸이 커버</template>
      </span>
      <span class="mono count">{{ photos.length }}장</span>
    </div>

    <div class="scroll-y grid">
      <div
        v-for="(ph, i) in photos"
        :key="ph.id"
        class="tile"
        :class="{ dragging: dragIndex === i, over: overIndex === i && dragIndex !== i }"
        @pointerdown="onPointerDown(i, $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onDragEnd"
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
  /* 드래그가 세로 스크롤에 먹히지 않게. 임계값 전에는 우리도 아무것도 안 하므로
     pan-y 를 남겨두면 스크롤과 드래그가 싸운다 — 칸 위에서는 우리가 가져간다. */
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
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
