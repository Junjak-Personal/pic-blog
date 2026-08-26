<script setup lang="ts">
/** 아트보드 1b 우측 레일 — 포인트 목록. 마커와 서로 하이라이트한다. */
import type { Point } from '#shared/types/db'
import { formatTime } from '#shared/utils/format'

const props = defineProps<{
  points: Point[]
  activeId: number | null
  camera: string | null
  format: string | null
  /** 모바일은 행 클릭 = 강조만, 우측 전용 버튼만 상세로 (아트보드 1b 인터랙션 규칙 2) */
  mobile?: boolean
}>()

const emit = defineEmits<{ select: [id: number]; open: [id: number] }>()

const listEl = useTemplateRef<HTMLElement>('listEl')

/** 마커에서 선택되면 목록이 해당 행으로 스크롤한다 */
watch(() => props.activeId, async (id) => {
  if (id == null) return
  await nextTick()
  listEl.value?.querySelector<HTMLElement>(`[data-row="${id}"]`)?.scrollIntoView({
    block: 'nearest',
    behavior: 'smooth',
  })
})

function onRow(id: number) {
  emit('select', id)
  // 데스크탑은 행 클릭 한 번으로 선택 + 상세가 열린다. 전용 버튼은 모바일에만.
  if (!props.mobile) emit('open', id)
}
</script>

<template>
  <aside class="rail">
    <header class="head">
      <span class="mono title">포인트 {{ props.points.length }}</span>
      <span class="mono sub">촬영 시각 순</span>
    </header>

    <ol ref="listEl" class="scroll-y list">
      <li
        v-for="(p, i) in props.points"
        :key="p.id"
        :data-row="p.id"
        class="row"
        :class="{ on: p.id === props.activeId }"
        @click="onRow(p.id)"
      >
        <span class="mono num">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="main">
          <span class="name">{{ p.title ?? `포인트 ${i + 1}` }}</span>
          <span class="mono sub2">{{ formatTime(p.first_shot_at) }} · {{ p.photos.length }}장</span>
        </span>
        <button
          type="button"
          class="open"
          :aria-label="`${p.title ?? '포인트'} 상세 열기`"
          @click.stop="emit('open', p.id)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6" /></svg>
        </button>
      </li>
    </ol>

    <footer v-if="props.camera || props.format" class="foot">
      <span v-if="props.camera" class="cam">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>
        <span class="mono">{{ props.camera }}</span>
      </span>
      <span v-if="props.format" class="mono">{{ props.format }}</span>
    </footer>
  </aside>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(11, 14, 18, 0.92);
  backdrop-filter: blur(12px);
  border-left: 1px solid var(--hair);
}

.head {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 15px 18px 13px;
  border-bottom: 1px solid var(--hair);
}
.title { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mid); }
.sub { font-size: 10px; color: var(--faint); }

.list { flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; }
.row {
  display: grid;
  grid-template-columns: 28px 1fr 28px;
  gap: 11px;
  align-items: center;
  padding: 11px 14px 11px 18px;
  border-bottom: 1px solid var(--hair-soft);
  cursor: pointer;
}
.row:hover { background: rgba(232, 235, 233, 0.06); }
.row.on { background: rgba(232, 235, 233, 0.1); }

.num {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 10.5px;
  font-weight: 600;
  background: rgba(19, 28, 24, 0.94);
  color: var(--mid);
  border: 1px solid rgba(146, 178, 169, 0.55);
}
.row.on .num { background: var(--ink); color: var(--s0); border-color: var(--ink); }

.main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.name {
  font-size: 14.5px;
  line-height: 1.2;
  color: var(--mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row.on .name { color: var(--ink); }
.sub2 { font-size: 10px; color: var(--faint); white-space: nowrap; }

.open {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
  color: var(--deep);
  cursor: pointer;
}
.open:hover { background: rgba(146, 178, 169, 0.14); }

.foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-top: 1px solid var(--hair);
  font-size: 10px;
  color: var(--faint);
}
.cam { display: flex; align-items: center; gap: 6px; }

/* 모바일: 터치 타깃 40×44 (아트보드 1b 인터랙션 규칙 2) */
@media (max-width: 900px) {
  .rail { border-left: 0; border-top: 1px solid rgba(146, 178, 169, 0.28); }
  .row { grid-template-columns: 24px 1fr 40px; padding: 10px 8px 10px 16px; }
  .num { width: 23px; height: 23px; font-size: 9.5px; }
  .name { font-size: 13.5px; }
  .open { width: 40px; height: 44px; }
}
</style>
