<script setup lang="ts">
import { vSk } from '~/utils/img'
/**
 * 편집 2단계 「포인트 편집」 — 이 기록의 사진 전부를 포인트별 그룹으로 늘어놓는다.
 *
 * 여기서 하는 것: 사진을 다른 포인트로 옮기기 · 포인트 안 순서 바꾸기 ·
 * 사진을 끌어내 새 포인트로 분리하기 · 사진 삭제 · 기록 커버 지정.
 *
 * 🔴 여기서 고르는 「커버」는 «기록» 커버다 (목록 카드에 뜨는 한 장).
 *    포인트마다의 대표 썸네일(지도 마커에 뜨는 것)은 3단계가 따로 고른다 — 다른 값이다.
 * 포인트 이름·태그·본문은 3단계 몫이라 여기서는 이름을 읽기만 한다.
 *
 * 포인트를 지우는 «버튼»은 없다. 마지막 사진이 빠져나가면 포인트도 같이 사라지므로
 * 삭제 경로가 이미 하나 있고, 버튼을 따로 두면 같은 일을 하는 길이 둘이 된다.
 * 대신 사라지는 순간을 반드시 확인받는다 (부모의 confirmVanish).
 *
 * 상태는 이 컴포넌트가 갖지 않는다 — 부모의 초안이 SSOT 이고 여기서는 «무엇을 어디로»만
 * 올려보낸다. 보드가 자기 배열을 따로 들면 저장 직전에 둘이 갈린다.
 *
 * 「빈 포인트」는 존재할 수 없다. 새 포인트는 사진을 끌어내야만 생기고, 마지막 한 장이
 * 빠져나간 그룹은 그 자리에서 사라진다 — 지도에 좌표만 남은 유령을 만들지 않기 위해서다.
 */
import BoardMap, { type BoardMapPoint } from '~/components/BoardMap.vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import type { Photo } from '#shared/types/db'
import { formatTime } from '#shared/utils/format'
import { centroid } from '#shared/utils/cluster'
import { distanceM } from '#shared/utils/geo'
import { useTileDrag, type DragFrom, type DragOver } from '~/composables/useTileDrag'

export interface BoardGroup {
  /** 초안 id. 음수면 아직 서버에 없는 새 포인트다. */
  id: number
  title: string
  photos: Photo[]
  /** 지금 지도에 찍히는 자리. 아직 저장 안 된 새 포인트는 null — 저장할 때 사진 평균으로 잡힌다. */
  anchor: { lat: number; lng: number } | null
  /** 이 포인트의 대표 사진. null 이면 첫 사진 (지도 마커와 같은 규칙). */
  coverPhotoId: number | null
}

const props = defineProps<{
  groups: BoardGroup[]
  /** 지금 기록 커버인 사진 id */
  coverId: number | null
  /** 포인트별 사진 추가를 막는 이유. null 이면 열려 있다. */
  addBlocked?: string | null
}>()

const emit = defineEmits<{
  /** 사진 한 장이 어디에서 어디로 — 새 포인트면 over.groupId 가 null 이다 */
  drop: [from: DragFrom, over: DragOver]
  removePhoto: [id: number]
  pickCover: [id: number]
  /** 이 포인트를 어느 자리에 찍을지 */
  setAnchor: [groupId: number, kind: 'centroid' | 'cover']
  /** 사진을 크게 본다 — 그 포인트 안에서만 좌우로 넘긴다 */
  openPhoto: [groupId: number, index: number]
  /** 이 포인트에 사진을 붙인다 — 좌표와 상관없이 이 포인트로 들어간다 */
  addToPoint: [groupId: number]
  add: []
}>()

const drag = useTileDrag((from, over) => emit('drop', from, over))

/**
 * 커버 고르는 중.
 *
 * 모드를 두는 이유: 칸을 그냥 누르는 것은 평소에 아무 일도 안 해야 한다. 상시로
 * 「클릭 = 커버」면 드래그하려다 손이 미끄러진 순간 커버가 바뀌고, 그걸 되돌릴
 * 방법도 눈에 안 보인다. 「지정」을 누른 동안만 칸이 고를 수 있는 것이 된다.
 */
const picking = ref(false)

function onTileClick(groupId: number, index: number, photoId: number) {
  if (picking.value) {
    picking.value = false
    emit('pickCover', photoId)
    return
  }
  // 🔴 방금 끈 제스처의 뒤따르는 click 은 「보기」가 아니다 (useTileDrag 의 dragged)
  if (drag.dragged.value) {
    drag.dragged.value = false
    return
  }
  emit('openPhoto', groupId, index)
}

/** Esc 로 빠져나온다 — 모드에 갇히면 안 된다 */
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') picking.value = false
}
onMounted(() => window.addEventListener('keydown', onEsc))
onBeforeUnmount(() => window.removeEventListener('keydown', onEsc))

const totalPhotos = computed(() => props.groups.reduce((n, g) => n + g.photos.length, 0))

/** 지도에 찍을 것 — 초안의 «지금» 자리다 (저장 전 변경도 그대로 보인다) */
const mapPoints = computed<BoardMapPoint[]>(() =>
  props.groups.flatMap((g, i) => {
    const spot = anchorOf(g)
    return spot ? [{ id: g.id, num: i + 1, name: g.title, lat: spot.lat, lng: spot.lng }] : []
  }),
)

/** 마커를 누르면 그 그룹으로 굴러간다 — 36개짜리 목록에서 눈으로 찾는 건 일이다 */
function scrollToGroup(id: number) {
  const el = document.querySelector<HTMLElement>(`[data-group="${id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el?.classList.add('flash')
  setTimeout(() => el?.classList.remove('flash'), 900)
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

/* ── 포인트 자리 ───────────────────────────────────────────────────────────
 * 기본은 사진 평균이다. 거리로 안 묶이는 것을 «맥락»으로 묶으면 (멀리 떨어진 두 곳을
 * 한 포인트로) 평균이 아무도 안 간 중간에 찍히므로, 대표 사진 자리로 옮길 길을 둔다.
 */
type Spot = { lat: number; lng: number }

/** 같은 자리로 볼 거리 — GPS 흔들림보다 작다 */
const SAME_M = 0.5

function centroidOf(g: BoardGroup): Spot | null {
  return g.photos.length ? centroid(g.photos) : null
}

/** 대표 사진의 좌표. 지정이 없으면 첫 사진 — 지도 마커가 쓰는 규칙과 같다. */
function coverOf(g: BoardGroup): Spot | null {
  const p = g.photos.find((ph) => ph.id === g.coverPhotoId) ?? g.photos[0]
  return p ? { lat: p.lat, lng: p.lng } : null
}

/** 지금 찍히는 자리. 저장 전 새 포인트는 앵커가 없으므로 저장될 값(평균)을 보여준다. */
function anchorOf(g: BoardGroup): Spot | null {
  return g.anchor ?? centroidOf(g)
}

function gapM(a: Spot | null, b: Spot | null) {
  return a && b ? distanceM([a.lat, a.lng], [b.lat, b.lng]) : 0
}

function isAt(g: BoardGroup, target: Spot | null) {
  return !!target && gapM(anchorOf(g), target) < SAME_M
}

/** 누르면 몇 m 움직이는지 — 0 이면 이미 그 자리라 표시하지 않는다 */
function moveLabel(g: BoardGroup, target: Spot | null) {
  const d = gapM(anchorOf(g), target)
  return d < SAME_M ? null : `${d < 1000 ? Math.round(d) + 'm' : (d / 1000).toFixed(1) + 'km'} 이동`
}

/** 지금 어느 규칙으로 찍혀 있는가 — 어느 쪽도 아니면 「처음 잡힌 자리」다 */
function anchorNow(g: BoardGroup) {
  if (isAt(g, centroidOf(g))) return '사진 평균 자리'
  if (isAt(g, coverOf(g))) return '대표 사진 자리'
  return '처음 잡힌 자리'
}

/**
 * 지금 «이 규칙»으로 찍혀 있는가.
 * 🔴 두 후보가 같은 지점일 수 있다 (사진 한 장짜리 포인트, 또는 평균이 우연히 대표
 *    사진 위에 떨어진 경우). 그때 둘 다 「지금 여기」로 표시하면 헤더가 말하는 하나와
 *    어긋난다 — 헤더와 «같은 우선순위»로 하나만 고른다 (평균이 먼저).
 */
function isCurrentMode(g: BoardGroup, mode: 'centroid' | 'cover') {
  const atCentroid = isAt(g, centroidOf(g))
  return mode === 'centroid' ? atCentroid : !atCentroid && isAt(g, coverOf(g))
}

/** 헤더에 붙는 짧은 꼬리표 — 아이콘만으로는 무엇으로 잡혀 있는지 알 수 없다 */
function anchorTag(g: BoardGroup) {
  if (isAt(g, centroidOf(g))) return '사진 평균'
  if (isAt(g, coverOf(g))) return '대표 사진'
  return '처음 자리'
}

/** 이 포인트의 대표 사진인가 — 3단계와 같은 규칙(지정이 없으면 첫 사진) */
function isPointCover(g: BoardGroup, photoId: number) {
  const cover = g.photos.find((p) => p.id === g.coverPhotoId) ?? g.photos[0]
  return !!cover && cover.id === photoId
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
        <template v-if="picking">커버로 쓸 사진을 고르세요 · Esc 로 취소</template>
        <template v-else>눌러서 크게 보기 · 끌어서 다른 포인트로 (터치는 꾹 눌러서)</template>
      </span>
      <div class="acts">
        <button
          type="button"
          class="addbtn mono"
          :class="{ armed: picking }"
          :aria-pressed="picking"
          @click="picking = !picking"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg>
          {{ picking ? '고르는 중…' : '커버 지정' }}
        </button>
        <button type="button" class="addbtn mono" @click="emit('add')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
          사진 추가
        </button>
      </div>
    </div>

    <!-- 지금 포인트들이 어디에 찍히는지 — 자리를 바꾸면 그 자리에서 마커가 움직인다 -->
    <BoardMap v-if="mapPoints.length" :points="mapPoints" @select="scrollToGroup" />

    <!-- touchmove 는 여기서 받는다 — 드래그 중일 때만 브라우저 스크롤을 막는다 -->
    <div class="scroll-y board" :class="{ picking }" @touchmove="drag.onTouchMove">
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
          <span class="mono gmeta">{{ g.photos.length }}장</span>
          <!-- 아이콘 왼쪽에 지금 자리를 적는다 — 아이콘만으로는 무엇으로 잡혔는지 모른다 -->
          <span class="mono gspot">{{ anchorTag(g) }}</span>

          <!--
            포인트를 어느 자리에 찍을지. 여기 있던 촬영 시각은 뺐다 — 그룹의 시각은
            «첫 타일의 시각»과 같은 값이라 칸마다 이미 적혀 있다.

            목록 스타일(.ovf-*)은 menu.css 에 있다. 포털이 내용을 body 로 옮기므로
            scoped 가 닿지 않는다 — OverflowMenu 와 같은 이유로 같은 것을 쓴다.
          -->
          <DropdownMenuRoot>
            <DropdownMenuTrigger
              class="spotbtn"
              :aria-label="`${g.title} 포인트 자리 — 지금 ${anchorNow(g)}`"
              :data-testid="`board-spot-${gi}`"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="ovf-content" align="end" :side-offset="6" :collision-padding="12">
                <!-- 누르기 «전»에 지금 어디인지 알아야 판단이 된다 -->
                <div class="ovf-head mono">지금 {{ anchorNow(g) }}</div>
                <DropdownMenuItem
                  class="ovf-item"
                  :class="{ current: isCurrentMode(g, 'centroid') }"
                  :data-testid="`board-spot-avg-${gi}`"
                  @select="emit('setAnchor', g.id, 'centroid')"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
                  사진 평균 자리로
                  <span v-if="isCurrentMode(g, 'centroid')" class="ovf-state">지금 여기</span>
                  <span v-else-if="moveLabel(g, centroidOf(g))" class="ovf-state">{{ moveLabel(g, centroidOf(g)) }}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="ovf-item"
                  :class="{ current: isCurrentMode(g, 'cover') }"
                  :data-testid="`board-spot-cover-${gi}`"
                  @select="emit('setAnchor', g.id, 'cover')"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg>
                  대표 사진 자리로
                  <span v-if="isCurrentMode(g, 'cover')" class="ovf-state">지금 여기</span>
                  <span v-else-if="moveLabel(g, coverOf(g))" class="ovf-state">{{ moveLabel(g, coverOf(g)) }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
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
              @click="onTileClick(g.id, i, ph.id)"
            >
              <img v-sk class="thumb sk" :src="ph.thumb_path" :alt="`사진 ${i + 1}`" loading="lazy" draggable="false">
              <span class="mono ord">{{ String(i + 1).padStart(2, '0') }}</span>
              <!--
                포스트 커버(목록 카드에 뜨는 한 장)와 포인트 대표(지도 마커)는 다른 값이라
                한 사진에 둘 다 붙을 수 있다 — 겹치지 않게 한 줄로 늘어놓는다.
              -->
              <span class="badges">
                <span v-if="isPointCover(g, ph.id)" class="mono rep">대표</span>
                <span v-if="ph.id === coverId" class="mono cover">커버</span>
              </span>

              <button
                type="button"
                class="kill"
                :aria-label="`${i + 1}번 사진 삭제`"
                @click.stop="emit('removePhoto', ph.id)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
              </button>

              <span class="bar">
                <span class="mono shot">{{ formatTime(ph.shot_at) || '시각 없음' }}</span>
                <!--
                  data-handle — 여기서 시작한 포인터는 롱프레스를 기다리지 않는다.
                  「끌라고 있는 손잡이」를 잡고도 1초를 기다려야 하면 고장난 것으로 읽힌다.
                -->
                <button
                  type="button"
                  class="handle"
                  data-handle
                  :aria-label="`${i + 1}번 사진 — 끌어서 옮기기, 좌우 방향키로 순서, Alt+위아래로 다른 포인트`"
                  @keydown="onKey($event, gi, i)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M4 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M18 15a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
                </button>
              </span>
            </div>
          </template>
          <span v-if="isCaret(g.id, g.photos.length)" class="caret" />

          <!--
            사진 칸과 «같은 크기»의 추가 칸. 그룹 맨 뒤에 둔다 — 하단에 버튼 하나로 두면
            어느 포인트에 들어가는지가 안 보인다. 여기 있으면 자리가 곧 대상이다.
            🔴 새 포인트(음수 id)는 서버에 아직 없어서 붙일 수 없다.
          -->
          <button
            v-if="g.id > 0"
            type="button"
            class="addtile"
            :disabled="!!props.addBlocked"
            :title="props.addBlocked ?? undefined"
            :aria-label="`${g.title} 포인트에 사진 추가`"
            :data-testid="`board-add-${gi}`"
            @click="emit('addToPoint', g.id)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
            <span class="mono">사진 추가</span>
          </button>
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
/* 고르는 중 — 다음에 누를 것이 「이 버튼」이 아니라 「사진」이라는 걸 색으로 말한다 */
.addbtn.armed { background: var(--acc); border-color: var(--acc); color: var(--s0); }
/* 두 버튼은 한 덩어리다 — space-between 에 낱개로 두면 둘 사이가 벌어져 남남처럼 보인다 */
.acts { display: flex; align-items: center; gap: 8px; flex: none; }

.board { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding-bottom: 8px; }

.group {
  flex: none;
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
  background: rgba(146, 178, 169, 0.03);
  transition: border-color 0.12s, background 0.12s;
  /*
   * 가상 스크롤 — 화면 밖 그룹은 브라우저가 통째로 건너뛴다 (레이아웃도 페인트도).
   *
   * 사진 한 장이 칸 하나라 500장이면 칸이 500개고, 그 전부를 매번 다시 재는 순간
   * 스크롤이 끊긴다. JS 로 잘라 붙이는 가상 목록 대신 이걸 쓴 이유는 셋이다:
   *   · 칸이 DOM 에서 사라지지 않아 드래그의 elementFromPoint 조준이 그대로 산다
   *   · flex-wrap 로 줄이 접히는 높이를 미리 계산할 필요가 없다
   *   · 지원하지 않는 브라우저에서는 두 줄이 무시될 뿐, 화면은 지금과 똑같다
   *
   * contain-intrinsic-size 의 auto 는 「한 번이라도 그려봤으면 그때 높이를 기억한다」다 —
   * 두 번째부터는 자리표시 높이가 실제와 같아 스크롤바가 튀지 않는다. 240px 은
   * 두 줄짜리 그룹의 대략적인 높이(머리 44 + 타일 두 줄)로, 처음 훑을 때만 쓰인다.
   */
  content-visibility: auto;
  contain-intrinsic-size: auto 240px;
}
/* 지도 마커로 찾아온 그룹 — 잠깐 빛나고 사라진다 */
.group.flash { border-color: var(--acc); background: rgba(146, 178, 169, 0.1); }

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
.gspot { flex: none; font-size: 10px; color: var(--deep); }

/* 포인트 자리 — 헤더 높이(44px) 안에 들어가는 아이콘 버튼 */
.spotbtn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--deep);
  cursor: pointer;
}
.spotbtn:hover { background: rgba(146, 178, 169, 0.14); color: var(--ink); }
.spotbtn[data-state='open'] { background: rgba(146, 178, 169, 0.14); color: var(--ink); }

@media (max-width: 900px) {
  .spotbtn { width: 40px; height: 40px; }
}

/* grid 가 아니라 flex-wrap 이다 — 끼어들 자리 표식(.caret)이 칸 사이에 실제로 끼어야 한다 */
.tiles { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px 12px; align-items: flex-start; }

/* 사진 칸과 같은 크기·같은 자리 — 다른 규격이면 격자가 흐트러진다 */
.addtile {
  flex: none;
  width: 104px;
  height: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px dashed rgba(146, 178, 169, 0.34);
  border-radius: 6px;
  background: none;
  color: var(--deep);
  font-size: 9.5px;
  cursor: pointer;
}
.addtile:hover:not(:disabled) { border-color: var(--acc); color: var(--ink); background: rgba(146, 178, 169, 0.08); }
.addtile:disabled { opacity: 0.4; cursor: default; }

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
  /* 🔴 이게 없으면 iOS 에서 사진을 꾹 누르는 순간 「사진 저장 / 복사」 시트가 떠서
     롱프레스 드래그가 아예 시작되지 못한다 — 실기기에서 드래그가 안 되던 원인이다. */
  -webkit-touch-callout: none;
  cursor: grab;
}
.tile.src { opacity: 0.35; }

/* 커버 고르는 중: 칸이 고를 수 있는 것이 된다 */
.board.picking .tile { cursor: pointer; }
.board.picking .tile:hover { box-shadow: inset 0 0 0 2px var(--acc); }
/* 지금 커버는 이미 고른 것이라 다시 고를 일이 없다 — 표식만 유지한다 */
.board.picking .tile .kill,
.board.picking .tile .handle { opacity: 0.25; pointer-events: none; }

.thumb {
  display: block;
  width: 100%;
  height: 74px;
  object-fit: cover;
  /* 이미지 자신에게도 걸어야 한다 — 콜아웃은 <img> 를 보고 뜬다 */
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

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
/*
 * 배지 줄 — 사진 «아래쪽»에 붙인다. 위에 두면 번호(.ord)와 삭제(✕) 사이에 끼어
 * 좁은 화면(3열)에서 「커버」가 ✕ 에 잘렸다. 아래는 시각 바 위라 비어 있다.
 */
.badges { position: absolute; left: 4px; bottom: 26px; display: flex; gap: 3px; }
.rep, .cover { padding: 1px 5px; border-radius: 4px; font-size: 9px; }
.rep { background: rgba(146, 178, 169, 0.9); color: var(--s0); }
.cover { background: var(--ink); color: var(--s0); }

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
  /* 손잡이 위에서는 브라우저 스크롤을 아예 넘겨받는다 — 여기서 시작하면 곧바로 드래그다 */
  touch-action: none;
  -webkit-touch-callout: none;
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
  /* 나란히 놓인 두 버튼이라 32px 은 좁다 */
  .addbtn { min-height: 40px; }
  /* 3열 — 여백을 빼고 나눈다 */
  .tile { width: calc((100% - 16px) / 3); }
  .addtile { width: calc((100% - 16px) / 3); height: 88px; }
  .thumb { height: 66px; }
  .caret { min-height: 66px; }
  .kill { width: 26px; height: 26px; }
  /* 손가락이 자주 빗나가는 자리라 보이지 않는 여유를 준다 (칸이 좁아 44px 정사각은 못 넣는다) */
  .kill::after { content: ''; position: absolute; top: -4px; right: -4px; width: 38px; height: 38px; }
  /* 하단 CTA(저장) 위에 앉힌다 — 겹치면 떨구려다 저장을 누른다 */
  .newzone { height: 74px; bottom: calc(var(--cta-h) + 8px + env(safe-area-inset-bottom)); width: calc(100% - 24px); }
}
</style>
