<script setup lang="ts">
import { vSk } from '~/utils/img'
/**
 * 편집 2단계 「포인트 편집」 — 이 기록의 사진 전부를 포인트별 그룹으로 늘어놓는다.
 *
 * 여기서 하는 것: 사진을 다른 포인트로 옮기기 · 포인트 안 순서 바꾸기 ·
 * 사진을 끌어내 새 포인트로 분리하기 · 사진 삭제 · 포인트 제거(사진째).
 * 포인트 이름·태그·본문은 3단계 몫이라 여기서는 이름을 읽기만 한다.
 *
 * 상태는 이 컴포넌트가 갖지 않는다 — 부모의 초안이 SSOT 이고 여기서는 «무엇을 어디로»만
 * 올려보낸다. 보드가 자기 배열을 따로 들면 저장 직전에 둘이 갈린다.
 *
 * 「빈 포인트」는 존재할 수 없다. 새 포인트는 사진을 끌어내야만 생기고, 마지막 한 장이
 * 빠져나간 그룹은 그 자리에서 사라진다 — 지도에 좌표만 남은 유령을 만들지 않기 위해서다.
 */
import type { Photo } from '#shared/types/db'
import { formatTime } from '#shared/utils/format'
import { useTileDrag, type DragFrom, type DragOver } from '~/composables/useTileDrag'

export interface BoardGroup {
  /** 초안 id. 음수면 아직 서버에 없는 새 포인트다. */
  id: number
  title: string
  photos: Photo[]
}

const props = defineProps<{
  groups: BoardGroup[]
  /** 기록 커버 — 「첫 포인트의 첫 사진」이라 이 보드에서 끌면 커버도 따라 움직인다 */
  coverId: number | null
}>()

const emit = defineEmits<{
  /** 사진 한 장이 어디에서 어디로 — 새 포인트면 over.groupId 가 null 이다 */
  drop: [from: DragFrom, over: DragOver]
  removePhoto: [id: number]
  removeGroup: [id: number]
  add: []
}>()

const drag = useTileDrag((from, over) => emit('drop', from, over))

const totalPhotos = computed(() => props.groups.reduce((n, g) => n + g.photos.length, 0))

/** 그룹의 대표 시각 — 서버의 first_shot_at 과 같은 규칙(가장 이른 촬영 시각)이다 */
function headTime(g: BoardGroup) {
  const times = g.photos.map((p) => p.shot_at).filter((t): t is string => t !== null).sort()
  return times[0] ? formatTime(times[0]) : '시각 없음'
}

/** 끌고 있는 칸인지 — 원본은 흐려두고 고스트가 손끝을 따라간다 */
function isSource(photoId: number) {
  return drag.dragging.value && drag.from.value?.photoId === photoId
}

/** 끼어들 자리 표식. 출발점 바로 앞뒤는 그리지 않는다 — 제자리 놓기는 아무 일도 아니다. */
function isCaret(groupId: number, index: number) {
  const o = drag.over.value
  if (!drag.dragging.value || !o || o.groupId !== groupId || o.index !== index) return false
  const f = drag.from.value
  if (!f || f.groupId !== groupId) return true
  const at = props.groups.find((g) => g.id === groupId)?.photos.findIndex((p) => p.id === f.photoId) ?? -1
  return index !== at && index !== at + 1
}

function removeGroup(g: BoardGroup) {
  if (!window.confirm(`「${g.title}」 포인트를 제거합니다. 안에 있는 사진 ${g.photos.length}장도 함께 삭제됩니다.`)) return
  emit('removeGroup', g.id)
}

/**
 * 키보드 경로 — 드래그가 유일한 방법이면 키보드 사용자는 사진을 옮길 수 없다.
 *   ←/→        그룹 안에서 순서
 *   Alt+↑/↓    앞/뒤 포인트로 이동. 마지막 그룹에서 Alt+↓ 는 새 포인트로 분리한다.
 */
function onKey(e: KeyboardEvent, groupIndex: number, photoIndex: number) {
  const g = props.groups[groupIndex]
  const photo = g?.photos[photoIndex]
  if (!g || !photo) return
  const from: DragFrom = { groupId: g.id, photoId: photo.id }

  if (!e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const to = e.key === 'ArrowLeft' ? photoIndex - 1 : photoIndex + 2
    if (to < 0 || to > g.photos.length) return
    e.preventDefault()
    emit('drop', from, { groupId: g.id, index: to })
    return
  }

  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
    if (e.key === 'ArrowUp') {
      const prev = props.groups[groupIndex - 1]
      if (prev) emit('drop', from, { groupId: prev.id, index: prev.photos.length })
      return
    }
    const next = props.groups[groupIndex + 1]
    // 마지막 그룹 다음 = 새 포인트. 혼자 남은 사진을 분리하는 건 아무 일도 아니라 막는다.
    if (next) emit('drop', from, { groupId: next.id, index: 0 })
    else if (g.photos.length > 1) emit('drop', from, { groupId: null, index: 0 })
  }
}
</script>

<template>
  <div class="board-wrap">
    <div class="board-head">
      <span class="mono label">
        포인트 {{ groups.length }} · 사진 {{ totalPhotos }}장
      </span>
      <span class="mono hint">
        끌어서 다른 포인트로 · 터치는 꾹 눌러서
      </span>
      <button type="button" class="addbtn mono" @click="emit('add')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
        사진 추가
      </button>
    </div>

    <!-- touchmove 는 여기서 받는다 — 드래그 중일 때만 브라우저 스크롤을 막는다 -->
    <div class="scroll-y board" @touchmove="drag.onTouchMove">
      <section
        v-for="(g, gi) in groups"
        :key="g.id"
        class="group"
        :class="{ target: drag.over.value?.groupId === g.id, fresh: g.id < 0 }"
        :data-group="g.id"
        :data-count="g.photos.length"
        :data-testid="`board-group-${gi}`"
      >
        <header class="ghead">
          <span class="mono gnum">{{ String(gi + 1).padStart(2, '0') }}</span>
          <span class="gname">{{ g.title }}</span>
          <span v-if="g.id < 0" class="mono badge-new">새 포인트</span>
          <span class="mono gmeta">{{ g.photos.length }}장 · {{ headTime(g) }}</span>
          <button
            type="button"
            class="gkill"
            :aria-label="`${g.title} 포인트 제거 — 사진 ${g.photos.length}장도 함께 삭제`"
            @click="removeGroup(g)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3h6v3" /></svg>
          </button>
        </header>

        <div class="tiles">
          <template v-for="(ph, i) in g.photos" :key="ph.id">
            <span v-if="isCaret(g.id, i)" class="caret" />
            <div
              class="tile"
              :class="{ src: isSource(ph.id) }"
              :data-tile="i"
              @pointerdown="drag.onPointerDown($event, { groupId: g.id, photoId: ph.id })"
              @pointermove="drag.onPointerMove"
              @pointerup="drag.onPointerUp"
              @pointercancel="drag.cancel"
            >
              <img v-sk class="thumb sk" :src="ph.thumb_path" :alt="`사진 ${i + 1}`" loading="lazy" draggable="false">
              <span class="mono ord">{{ String(i + 1).padStart(2, '0') }}</span>
              <span v-if="ph.id === coverId" class="mono cover">커버</span>

              <button
                type="button"
                class="kill"
                :aria-label="`${i + 1}번 사진 삭제`"
                @click="emit('removePhoto', ph.id)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
              </button>

              <span class="bar">
                <span class="mono shot">{{ formatTime(ph.shot_at) || '시각 없음' }}</span>
                <button
                  type="button"
                  class="handle"
                  :aria-label="`${i + 1}번 사진 — 좌우 방향키로 순서, Alt+위아래로 다른 포인트`"
                  @keydown="onKey($event, gi, i)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M4 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
                </button>
              </span>
            </div>
          </template>
          <span v-if="isCaret(g.id, g.photos.length)" class="caret" />
        </div>
      </section>

      <!--
        새 포인트로 분리. 드래그 중에만 뜬다 — 늘 떠 있으면 목록 끝에 「누를 수 없는 상자」가
        하나 붙어 있는 꼴이고, 실제로 이 영역은 떨구는 것 말고는 할 일이 없다.

        🔴 fixed 여야 한다. 처음엔 sticky(bottom:0)로 뒀는데 sticky 는 «지나가는 요소를
           붙잡아 두는» 것이지 화면 밖에 있는 요소를 끌어올리지 못한다 — 보드가 2400px 이면
           이 영역은 화면 아래 1800px 지점에 그대로 있어서 떨굴 방법이 없었다.
      -->
      <div
        v-show="drag.dragging.value"
        data-newzone
        class="newzone"
        :class="{ target: drag.over.value?.groupId === null }"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
        <span class="mono">여기 떨구면 새 포인트로 분리됩니다</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-wrap { flex: 1; display: flex; flex-direction: column; gap: 10px; min-height: 0; }

/* 모바일에서는 .hint 가 접히므로 flex:1 로 미는 것만으로는 버튼이 오른쪽에 안 붙는다 */
.board-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; }
.label { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.hint { flex: 1; font-size: 10px; color: var(--deep); }
.addbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid rgba(177, 199, 193, 0.2);
  border-radius: var(--radius);
  font-size: 11px;
  color: var(--mid);
  cursor: pointer;
}
.addbtn:hover { background: rgba(146, 178, 169, 0.1); }

.board { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding-bottom: 8px; }

.group {
  flex: none;
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
  background: rgba(146, 178, 169, 0.03);
  transition: border-color 0.12s, background 0.12s;
}
/* 손끝이 올라온 그룹 — 어디에 떨어질지 그룹 단위로 먼저 보여준다 */
.group.target { border-color: rgba(146, 178, 169, 0.6); background: rgba(146, 178, 169, 0.09); }
.group.fresh { border-style: dashed; border-color: rgba(214, 178, 106, 0.5); }

.ghead {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 10px 0 12px;
  border-bottom: 1px solid var(--hair-soft);
}
.gnum {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 600;
  background: rgba(19, 28, 24, 0.94);
  color: var(--mid);
  border: 1px solid rgba(146, 178, 169, 0.55);
}
.gname {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge-new { flex: none; padding: 2px 6px; border-radius: 4px; font-size: 9.5px; background: rgba(214, 178, 106, 0.16); color: var(--route); }
.gmeta { flex: none; font-size: 10px; color: var(--faint); }
.gkill {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius);
  color: var(--deep);
  cursor: pointer;
}
.gkill:hover { background: rgba(255, 128, 128, 0.12); color: var(--danger); }

/* grid 가 아니라 flex-wrap 이다 — 끼어들 자리 표식(.caret)이 칸 사이에 실제로 끼어야 한다 */
.tiles { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px 12px; align-items: flex-start; }

.caret {
  flex: none;
  width: 3px;
  align-self: stretch;
  min-height: 74px;
  border-radius: 3px;
  background: var(--acc);
}

.tile {
  position: relative;
  flex: none;
  width: 104px;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(11, 14, 18, 0.9);
  /*
   * 세로 스크롤은 브라우저에 맡긴다 — 사진이 화면 대부분이라 여기서 none 을 걸면
   * 목록을 굴릴 수 없다. 드래그가 실제로 시작된 뒤에만 touchmove 를 막는다.
   */
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
  cursor: grab;
}
.tile.src { opacity: 0.35; }

.thumb { display: block; width: 100%; height: 74px; object-fit: cover; }

.ord {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 9px;
  background: rgba(4, 4, 8, 0.72);
  color: var(--mid);
}
.cover {
  position: absolute;
  top: 4px;
  left: 30px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  background: var(--ink);
  color: var(--s0);
}

.kill {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: rgba(4, 4, 8, 0.72);
  color: var(--mid);
  cursor: pointer;
}
.kill:hover { background: var(--danger); color: #fff; }

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 22px;
  padding: 0 3px 0 6px;
}
.shot { font-size: 9px; color: var(--faint); }
.handle {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: var(--deep);
  cursor: grab;
}
.handle:hover { color: var(--mid); background: rgba(146, 178, 169, 0.14); }

.newzone {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  width: min(520px, calc(100% - 48px));
  z-index: 150;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  height: 66px;
  border: 1px dashed rgba(146, 178, 169, 0.42);
  border-radius: var(--radius-lg);
  background: rgba(11, 14, 18, 0.92);
  backdrop-filter: blur(6px);
  color: var(--faint);
  font-size: 11px;
}
.newzone.target { border-color: var(--acc); border-style: solid; color: var(--ink); background: rgba(146, 178, 169, 0.14); }

@media (max-width: 900px) {
  .hint { display: none; }
  /* 3열 — 여백을 빼고 나눈다 */
  .tile { width: calc((100% - 16px) / 3); }
  .thumb { height: 66px; }
  .caret { min-height: 66px; }
  /* 헤더 밖 조작 요소는 44px */
  .gkill { width: 44px; height: 44px; }
  .kill { width: 26px; height: 26px; }
  /* 손가락이 자주 빗나가는 자리라 보이지 않는 여유를 준다 (칸이 좁아 44px 정사각은 못 넣는다) */
  .kill::after { content: ''; position: absolute; top: -4px; right: -4px; width: 38px; height: 38px; }
  /* 하단 CTA(저장) 위에 앉힌다 — 겹치면 떨구려다 저장을 누른다 */
  .newzone { height: 74px; bottom: calc(var(--cta-h) + 8px + env(safe-area-inset-bottom)); width: calc(100% - 24px); }
}
</style>
