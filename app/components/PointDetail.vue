<script setup lang="ts">
/**
 * 아트보드 1b 포인트 상세 시트.
 * 데스크탑: 좌 스캐터 · 우 태그+본문 (1fr 352px)
 * 모바일:   세로 스택 — 스캐터 먼저, 스크롤하면 태그·본문
 * 하단에 EXIF 촬영값. 값이 없으면 그 줄만 감춘다.
 */
import type { Point } from '#shared/types/db'
import { formatDate, formatExifLine, formatOf, formatTime } from '#shared/utils/format'
import { formatCoord } from '#shared/utils/geo'

const props = defineProps<{
  point: Point
  index: number
  mobile?: boolean
}>()

const emit = defineEmits<{ close: []; openPhoto: [index: number] }>()

/*
 * 모바일 시트 — 아래로 쓸어서 닫기 (아트боard 1b).
 * ✕ 는 화면 위쪽 끝에 있어서 한 손으로 잡으면 엄지가 안 닿는다.
 *
 * 손잡이(.grip)와 헤더에서만 시작한다. 본문에서 잡으면 사진 산포·태그 스크롤과
 * 싸우고, 스크롤을 내리려다 시트가 닫히는 일이 생긴다.
 */
/** 모바일에서 사진 수·기기·EXIF 를 ⓘ 로 접어둔다 — 스캐터 밑에 두면 화면 밖으로 밀린다 */
const infoOpen = ref(false)

const DISMISS_PX = 110
const dragY = ref(0)
const dragging = ref(false)
let startY = 0

function onGripDown(e: PointerEvent) {
  if (!props.mobile || e.button !== 0) return
  dragging.value = true
  startY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onGripMove(e: PointerEvent) {
  if (!dragging.value) return
  // 위로는 안 끌린다 — 시트는 아래로만 사라진다
  dragY.value = Math.max(0, e.clientY - startY)
}

function onGripUp() {
  if (!dragging.value) return
  const far = dragY.value >= DISMISS_PX
  dragging.value = false
  dragY.value = 0
  if (far) emit('close')
}

const name = computed(() => props.point.title ?? `포인트 ${props.index + 1}`)

/** 본문은 빈 줄 기준으로 문단을 나눈다 */
const paragraphs = computed(() =>
  (props.point.body ?? '')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean),
)

/** 촬영값은 첫 사진 기준 — 같은 포인트는 대개 같은 기기·설정이다 */
const lead = computed(() => props.point.photos[0] ?? null)
const exifLine = computed(() => (lead.value ? formatExifLine(lead.value) : null))
const deviceLine = computed(() => {
  const p = lead.value
  if (!p) return null
  const parts = [p.camera, p.w ? `${Math.max(p.w, p.h)}px ${formatOf(p.display_path) ?? ''}`.trim() : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
})
</script>

<template>
  <section
    class="sheet"
    :class="{ mobile: props.mobile, dragging }"
    :style="dragY ? { transform: `translateY(${dragY}px)` } : undefined"
  >
    <!-- 모바일 손잡이. 여기와 헤더에서만 쓸어 닫기가 시작된다 -->
    <div
      class="grip"
      @pointerdown="onGripDown"
      @pointermove="onGripMove"
      @pointerup="onGripUp"
      @pointercancel="onGripUp"
    >
      <span class="grip-bar" />
    </div>

    <header
      class="head"
      @pointerdown="onGripDown"
      @pointermove="onGripMove"
      @pointerup="onGripUp"
      @pointercancel="onGripUp"
    >
      <span class="mono badge">{{ String(props.index + 1).padStart(2, '0') }}</span>
      <h2 class="name">{{ name }}</h2>
      <span class="meta wide-only">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 7v5l3 3" /></svg>
        <span class="mono">{{ formatDate(props.point.first_shot_at) }} {{ formatTime(props.point.first_shot_at) }}</span>
      </span>
      <span class="meta wide-only">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
        <span class="mono">{{ formatCoord(props.point.lat, props.point.lng) }}</span>
      </span>
      <div class="hact">
      <button
        v-if="props.mobile"
        type="button"
        class="info"
        :class="{ on: infoOpen }"
        :aria-expanded="infoOpen"
        aria-label="사진 정보"
        @click="infoOpen = !infoOpen"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" /></svg>
      </button>
      <button type="button" class="close" aria-label="상세 닫기" @click="emit('close')">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
      </button>
      </div>
    </header>

    <div class="body">
      <!--
        모바일 정보 판. 상세를 여기 «한 곳»에 모은다 — 헤더 메타·태그·본문·EXIF 가
        화면 곳곳에 흩어져 있으면 읽는 사람이 세 군데를 훑어야 한다.
        흐름에서 빼서(position: absolute) 열고 닫아도 레이아웃이 움직이지 않는다.
      -->
      <div v-if="props.mobile && infoOpen" class="infopane scroll-y" role="region" aria-label="포인트 정보">
        <dl class="ipair">
          <dt class="mono">시각</dt>
          <dd class="mono">{{ formatDate(props.point.first_shot_at) }} {{ formatTime(props.point.first_shot_at) }}</dd>
          <dt class="mono">좌표</dt>
          <dd class="mono">{{ formatCoord(props.point.lat, props.point.lng) }}</dd>
          <dt class="mono">사진</dt>
          <dd class="mono">{{ props.point.photos.length }}장 · 탭 하면 확대</dd>
          <template v-if="deviceLine">
            <dt class="mono">기기</dt>
            <dd class="mono">{{ deviceLine }}</dd>
          </template>
          <template v-if="exifLine">
            <dt class="mono">촬영</dt>
            <dd class="mono">{{ exifLine }}</dd>
          </template>
        </dl>

        <div v-if="props.point.tags.length" class="tags">
          <span v-for="tag in props.point.tags" :key="tag" class="mono tag">{{ tag }}</span>
        </div>

        <p v-for="(para, i) in paragraphs" :key="i" class="para">{{ para }}</p>
      </div>

      <div class="scatter-slot">
        <ScatterField
          :photos="props.point.photos"
          :point-id="props.point.id"
          :mobile="props.mobile"
          @open="emit('openPhoto', $event)"
        />
      </div>

      <div class="side scroll-y">
        <div v-if="props.point.tags.length" class="tags">
          <span v-for="tag in props.point.tags" :key="tag" class="mono tag">{{ tag }}</span>
        </div>

        <p v-for="(para, i) in paragraphs" :key="i" class="para">{{ para }}</p>

        <div v-if="deviceLine || exifLine" class="exif mono">
          <span v-if="deviceLine">{{ deviceLine }}</span>
          <span v-if="exifLine">{{ exifLine }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sheet.dragging { transition: none; }

.sheet {
  /* 끄는 동안은 손가락을 그대로 따라가고, 놓으면 제자리로 돌아간다 */
  transition: transform 0.22s ease;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(6, 7, 10, 0.96);
  backdrop-filter: blur(14px);
  border-top: 1px solid rgba(146, 178, 169, 0.3);
  border-radius: 12px 12px 0 0;
}

/* 손잡이 — 데스크탑에는 시트가 없다 */
.grip { display: none; }

.head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 24px 14px;
  border-bottom: 1px solid rgba(177, 199, 193, 0.1);
}
.badge {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 50%;
  background: var(--ink);
  color: var(--s0);
  font-size: 12px;
  font-weight: 600;
}
.name {
  font-size: 29px;
  letter-spacing: -0.025em;
  line-height: 1;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta { display: flex; align-items: center; gap: 6px; padding-top: 3px; color: var(--faint); flex: none; }
.meta .mono { font-size: 11px; color: var(--deep); }
.hact { margin-left: auto; display: flex; align-items: center; gap: 2px; flex: none; }

.close {
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  color: var(--deep);
  cursor: pointer;
}
.close:hover { color: var(--ink); }

.body { flex: 1; display: grid; grid-template-columns: 1fr 352px; min-height: 0; }
.scatter-slot { position: relative; min-width: 0; overflow: hidden; }

/* ⓘ 토글 — 데스크탑에는 없다 (v-if) */
.info {
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  color: var(--deep);
  cursor: pointer;
}
.info.on { color: var(--ink); }

/* 흐름 밖에서 본문을 덮는다 — 열고 닫아도 헤더·스캐터가 움직이지 않는다 */
.infopane {
  position: absolute;
  inset: 0;
  z-index: 30;
  padding: 16px 18px 22px;
  background: rgba(6, 7, 10, 0.97);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ipair {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 7px 14px;
  margin: 0;
  font-size: 12px;
}
.ipair dt { color: var(--faint); }
.ipair dd { margin: 0; color: var(--mid); }

.side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 24px;
  border-left: 1px solid rgba(177, 199, 193, 0.1);
}
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--mid);
  border: 1px solid rgba(146, 178, 169, 0.4);
  border-radius: var(--radius);
  padding: 4px 9px;
  white-space: nowrap;
}
.para { font-size: 14.5px; line-height: 1.78; color: var(--mid); text-wrap: pretty; }

.exif {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(177, 199, 193, 0.1);
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 10px;
  color: var(--faint);
}

/* 모바일·태블릿 — 세로 스택 */
@media (max-width: 1100px) {
  .body { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
  .side { border-left: 0; border-top: 1px solid rgba(177, 199, 193, 0.1); max-height: 44%; }
}
@media (max-width: 900px) {
  /* 손잡이 — 쓸어 닫을 수 있다는 유일한 시각 신호다 */
  .grip {
    display: grid;
    place-items: center;
    flex: none;
    height: 22px;
    /* 손잡이·헤더에서 세로 제스처를 우리가 가져간다 */
    touch-action: none;
    cursor: grab;
  }
  .grip-bar {
    width: 38px;
    height: 4px;
    border-radius: 999px;
    background: rgba(177, 199, 193, 0.3);
  }
  /* wrap 헤더에서는 margin-left:auto 가 「그 줄의 끝」으로만 밀어서 ⓘ·✕ 가
     아래 줄로 떨어진다. 우상단에 못 박는다. */
  /* 헤더는 한 줄 고정 — [번호] [이름] ... [ⓘ] [✕]. 시각·좌표는 ⓘ 판으로 갔다. */
  .head { flex-wrap: nowrap; gap: 12px; padding: 4px 14px 12px 18px; touch-action: none; }
  .wide-only { display: none; }
  .name { font-size: 21px; width: auto; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* 본문은 스캐터만. 태그·본문·EXIF 는 전부 ⓘ 판에 모였다 — 흩어놓지 않는다. */
  .body { position: relative; grid-template-columns: 1fr; grid-template-rows: 1fr; }
  .side { display: none; }
  .name { font-size: 26px; width: calc(100% - 80px); }
  .meta { padding-top: 0; }
  .side { padding: 16px 18px; }
  .para { font-size: 15px; line-height: 1.8; }
}
</style>
