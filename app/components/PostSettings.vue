<script setup lang="ts">
import PeriodPicker from '~/components/PeriodPicker.vue'
import RadiusSlider from '~/components/RadiusSlider.vue'
/**
 * 편집 1단계 「기본 정보」 — 타이틀 · 요약 · 공개 · 기간 · 포인트 범위.
 *
 * 타이틀·요약·공개·기간은 다른 편집과 같이 초안에 쌓였다가 「저장」에서 나간다.
 * 반경만 성격이 다르다 — 즉시 서버에 반영되고 되돌릴 수 없다. 2단계가 편집할
 * 포인트 자체를 갈아치우기 때문에 초안에 담아둘 수가 없다.
 * 그래서 반경만 별도 확인 절차를 갖고, 사라질 포인트를 이름까지 나열해 보여준다.
 */
import {
  AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle,
} from 'reka-ui'
import type { PostDetail } from '#shared/types/db'
import { clusterAt, DEFAULT_RADIUS, RADII, type ClusterInput } from '#shared/utils/cluster'
import { formatRange } from '#shared/utils/format'

const props = defineProps<{
  post: PostDetail
  /** 저장 안 된 초안이 있으면 반경 변경을 막는다 — 재클러스터링이 새로고침을 부르기 때문 */
  dirty: boolean
  busy: boolean
}>()

const title = defineModel<string>('title', { required: true })
const summary = defineModel<string>('summary', { required: true })
const isPublic = defineModel<boolean>('isPublic', { required: true })
/** YYYY-MM-DD. 화면 어디에도 시각까지 쓰는 자리가 없어 날짜만 고른다. */
const startedAt = defineModel<string>('startedAt', { required: true })
const endedAt = defineModel<string>('endedAt', { required: true })

const emit = defineEmits<{ recluster: [radius: number] }>()

/** 미리보기는 서버를 부르지 않는다 — 사진마다 lat/lng/shot_at 이 이미 내려와 있고
    업로드 화면과 같은 clusterAt 을 쓰므로 결과가 서버 계산과 일치한다. */
const shots = computed<ClusterInput[]>(() =>
  props.post.points
    .flatMap((p) => p.photos)
    .filter((ph) => ph.shot_at)
    .map((ph) => ({ key: String(ph.id), lat: ph.lat, lng: ph.lng, t: Date.parse(ph.shot_at!) })),
)

const currentRadius = computed(() => props.post.cluster_radius)
const table = computed(() =>
  RADII.map((r) => ({ radius: r, count: clusterAt(shots.value, r).length })),
)

/** 재클러스터링으로 내용을 잃게 될 포인트들 — 이름을 그대로 보여준다 */
const atRisk = computed(() =>
  props.post.points
    .filter((p) => p.title || p.body || p.tags.length || p.links.length || p.expenses.length)
    .map((p) => {
      const bits: string[] = []
      if (p.tags.length) bits.push(`태그 ${p.tags.length}`)
      if (p.body) bits.push(`본문 ${p.body.length}자`)
      if (p.links.length) bits.push(`링크 ${p.links.length}`)
      if (p.expenses.length) bits.push(`소비 ${p.expenses.length}건`)
      return { id: p.id, name: p.title || `포인트 ${p.order_index + 1}`, detail: bits.join(', ') }
    }),
)

/*
 * 열림 상태와 고른 값을 따로 둔다.
 * 한 ref 로 묶어(open = pending !== null) 두면 AlertDialogAction 이 자기 클릭 핸들러에서
 * 다이얼로그를 먼저 닫아 pending 을 null 로 만들고, 그 다음 우리 @click 이 돌면서
 * 「고른 값이 없다」고 판단해 조용히 아무것도 안 한다. 실제로 그렇게 실패했다.
 */
/** 기간을 손으로 바꿨는가 — 「EXIF 값으로」 되돌리기 버튼을 띄울 조건 */
const exifChanged = computed(
  () => startedAt.value !== dateOf(props.post.started_at) || endedAt.value !== dateOf(props.post.ended_at),
)
const badRange = computed(() => !!startedAt.value && !!endedAt.value && startedAt.value > endedAt.value)

function dateOf(iso: string | null) {
  return iso ? iso.slice(0, 10) : ''
}

function restoreExif() {
  startedAt.value = dateOf(props.post.started_at)
  endedAt.value = dateOf(props.post.ended_at)
}

const dialogOpen = ref(false)
const pending = ref<number | null>(null)

const pendingCount = computed(() =>
  pending.value === null ? 0 : clusterAt(shots.value, pending.value).length,
)

/** 슬라이더에 보이는 값 — 확인 전에는 현재 반경을 유지한다 */
const shown = computed(() => pending.value ?? currentRadius.value ?? DEFAULT_RADIUS)

function pick(r: number) {
  if (props.dirty || props.busy) return
  if (r === currentRadius.value) return
  pending.value = r
  dialogOpen.value = true
}

function confirmRecluster() {
  if (pending.value !== null) emit('recluster', pending.value)
  dialogOpen.value = false
}
</script>

<template>
  <div class="settings scroll-y">
    <section class="block">
      <h2 class="mono blabel">기록</h2>
      <label class="field">
        <span class="mono flabel">타이틀</span>
        <input v-model="title" class="input title" maxlength="200" placeholder="기록 제목" data-testid="settings-title-input">
      </label>
      <label class="field">
        <span class="mono flabel">요약</span>
        <input v-model="summary" class="input" maxlength="1000" placeholder="한 줄 요약" data-testid="settings-summary-input">
      </label>
    </section>

    <section class="block">
      <h2 class="mono blabel">공개</h2>
      <label class="switch">
        <input v-model="isPublic" type="checkbox" role="switch" aria-label="공개 여부">
        <span class="track"><span class="knob" /></span>
        <span class="switch-text">
          {{ isPublic ? '공개 — 링크로 누구나 볼 수 있습니다' : '비공개 — 나만 볼 수 있습니다' }}
        </span>
      </label>
    </section>

    <section class="block">
      <div class="bhead">
        <h2 class="mono blabel">기간</h2>
        <span class="mono bnow">EXIF 원본 {{ formatRange(post.started_at, post.ended_at) || '없음' }}</span>
      </div>

      <div class="period">
        <PeriodPicker v-model:started-at="startedAt" v-model:ended-at="endedAt" />
        <button
          v-if="exifChanged"
          type="button"
          class="revert mono"
          @click="restoreExif"
        >
          EXIF 값으로
        </button>
      </div>

      <p v-if="badRange" class="mono warn">시작이 종료보다 늦습니다</p>
      <!-- 조용한 덮어쓰기를 만들지 않는다 — 사진 추가가 이 값을 실제로 되돌린다 -->
      <p class="mono hint">
        사진을 추가하면 이 기간은 새 사진까지 포함한 EXIF 촬영 시각으로 다시 계산됩니다.
      </p>
    </section>

    <section class="block">
      <div class="bhead">
        <h2 class="mono blabel">포인트 범위</h2>
        <span class="mono bnow">
          현재 {{ post.points.length }}개<template v-if="currentRadius"> · {{ currentRadius }}m</template>
        </span>
      </div>

      <!-- 업로드 화면(1g)과 같은 컨트롤을 쓴다 — 같은 값을 고르는 자리에서
           한쪽은 슬라이더, 한쪽은 버튼이면 같은 기능으로 안 읽힌다. -->
      <div class="rwrap" :class="{ locked: dirty || busy }">
        <RadiusSlider
          :model-value="shown"
          label="포인트 범위"
          compact
          :sub-labels="table.map((row) => `${row.count}개`)"
          @update:model-value="pick"
        />
      </div>

      <p v-if="dirty" class="mono warn">
        저장하지 않은 변경이 있습니다. 먼저 저장한 뒤에 범위를 바꿀 수 있습니다.
      </p>
      <p v-else-if="!currentRadius" class="mono hint">
        이 기록은 반경이 기록되기 전에 만들어졌습니다. 범위를 한 번 고르면 그때부터 표시됩니다.
      </p>
      <p v-else class="mono hint">
        범위를 바꾸면 사진이 다시 묶입니다. 좌표와 촬영 시각은 그대로입니다.
      </p>
    </section>

    <AlertDialogRoot v-model:open="dialogOpen">
      <AlertDialogPortal>
        <AlertDialogOverlay class="ovl" />
        <AlertDialogContent class="dlg">
          <AlertDialogTitle class="dlg-title">포인트 범위 변경</AlertDialogTitle>

          <div class="dlg-diff mono">
            <span>{{ currentRadius ?? '?' }}m</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
            <b>{{ pending }}m</b>
            <span class="dlg-sep">·</span>
            <span>포인트 {{ post.points.length }}개</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
            <b>{{ pendingCount }}개</b>
          </div>

          <AlertDialogDescription class="dlg-desc">
            <template v-if="atRisk.length">
              아래 내용이 사라집니다. 되돌릴 수 없습니다.
            </template>
            <template v-else>
              사진이 다시 묶입니다. 지금은 잃을 이름·태그·본문·기타 정보가 없습니다.
            </template>
          </AlertDialogDescription>

          <ul v-if="atRisk.length" class="lose">
            <li v-for="r in atRisk" :key="r.id">
              <span class="lose-name">{{ r.name }}</span>
              <span v-if="r.detail" class="mono lose-detail">{{ r.detail }}</span>
            </li>
          </ul>

          <p class="mono dlg-note">사진과 촬영 정보는 그대로 남습니다. 포인트 안 사진 순서는 촬영 시각 순으로 돌아갑니다.</p>

          <div class="dlg-actions">
            <AlertDialogCancel class="btn ghost mono">취소</AlertDialogCancel>
            <AlertDialogAction class="btn danger mono" @click="confirmRecluster">
              {{ atRisk.length ? '바꾸고 지우기' : '범위 바꾸기' }}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  </div>
</template>

<style scoped>
.settings { flex: 1; min-height: 0; padding: 20px 24px 28px; display: flex; flex-direction: column; gap: 22px; }
.block { display: flex; flex-direction: column; gap: 10px; max-width: 680px; }

/* 기간 — 고르개 하나 + 「EXIF 값으로」. 좁아지면 되돌리기 버튼이 아래로 내려간다 */
.period { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.revert {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(177, 199, 193, 0.2);
  border-radius: var(--radius);
  font-size: 11px;
  color: var(--mid);
  cursor: pointer;
}
.revert:hover { background: rgba(146, 178, 169, 0.1); }
.warn { font-size: 10.5px; color: var(--danger); }

.bhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.blabel { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mid); }
.bnow { font-size: 11px; color: var(--deep); }

.field { display: flex; flex-direction: column; gap: 7px; }
.flabel { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.input {
  width: 100%;
  background: var(--field);
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 14px;
  color: var(--ink);
}
.input:focus {
  border-color: var(--focus-border);
  box-shadow: var(--focus-ring);
}
.input.title { font-family: var(--font-display); font-size: 21px; font-weight: 600; letter-spacing: -0.02em; }
.input::placeholder { color: var(--faint); }

.switch { position: relative; display: flex; align-items: center; gap: 11px; cursor: pointer; }
.switch input { position: absolute; width: 42px; height: 24px; margin: 0; opacity: 0; cursor: pointer; }
.track { position: relative; display: block; width: 42px; height: 24px; flex: none; border-radius: 999px; background: rgba(177, 199, 193, 0.2); transition: background 0.14s; }
.knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--mid); transition: transform 0.14s, background 0.14s; }
.switch input:checked ~ .track { background: rgba(146, 178, 169, 0.9); }
.switch input:checked ~ .track .knob { transform: translateX(18px); background: var(--s0); }
.switch input:focus-visible ~ .track { box-shadow: var(--focus-ring); }
.switch-text { font-size: 13px; color: var(--mid); }


.rwrap {
  background: rgba(11, 14, 18, 0.7);
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
  padding: 14px 16px 10px;
}
/* 저장 안 된 변경이 있으면 반경을 못 바꾼다 — 눌리지 않는 이유는 아래 문구가 말한다 */
.rwrap.locked { opacity: 0.45; pointer-events: none; }
.hint { font-size: 10.5px; line-height: 1.7; color: var(--faint); }
.warn { font-size: 10.5px; line-height: 1.7; color: var(--danger); }

.ovl { position: fixed; inset: 0; z-index: 100; background: rgba(4, 4, 8, 0.7); backdrop-filter: blur(3px); }
.dlg {
  position: fixed;
  z-index: 101;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100dvh - 64px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--s1);
  border: 1px solid rgba(146, 178, 169, 0.28);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.dlg-title { font-size: 17px; color: var(--ink); }
.dlg-diff { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--deep); }
.dlg-diff b { color: var(--ink); font-size: 13px; }
.dlg-sep { color: var(--faint); }
.dlg-desc { font-size: 13px; line-height: 1.6; color: var(--mid); }

.lose { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 10px 12px; list-style: none; background: rgba(255, 128, 128, 0.07); border: 1px solid rgba(255, 128, 128, 0.3); border-radius: var(--radius); }
.lose li { display: flex; align-items: baseline; gap: 10px; }
.lose-name { font-size: 13px; color: var(--ink); }
.lose-detail { margin-left: auto; font-size: 10px; color: var(--danger); }

.dlg-note { font-size: 10px; line-height: 1.7; color: var(--faint); }
.dlg-actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; padding: 0 15px; border-radius: var(--radius); font-size: 12px; cursor: pointer; }
.btn.ghost { border: 1px solid rgba(177, 199, 193, 0.2); color: var(--mid); }
.btn.danger { background: var(--danger); color: var(--s0); font-weight: 600; }

@media (max-width: 900px) {
  .settings { padding: 16px 16px calc(var(--cta-h) + env(safe-area-inset-bottom)); gap: 20px; }
  .input.title { font-size: 18px; }
  /* 「EXIF 값으로」는 자기 줄로 내려간다 */
  .revert { flex: 1 1 100%; }
  .revert { min-height: 44px; }
  .dlg-actions .btn { flex: 1; min-height: 44px; }
}
</style>
