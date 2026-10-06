<script setup lang="ts">
import ChoiceSelect from '~/components/ChoiceSelect.vue'
import PeriodPicker from '~/components/PeriodPicker.vue'
import RadiusSlider from '~/components/RadiusSlider.vue'
/**
 * 편집 1단계 「기본 정보」 — 타이틀 · 요약 · 공개 · 기간(+ 일차 기준) · 포인트 범위.
 *
 * 타이틀·요약·공개·기간은 다른 편집과 같이 초안에 쌓였다가 「저장」에서 나간다.
 * 반경과 일차 기준(일차별 끝 시각 · 공백)은 성격이 다르다 — 즉시 서버에 반영되고 되돌릴 수
 * 없다. 2단계가 편집할 포인트 자체를 갈아치우기 때문에 초안에 담아둘 수가 없다.
 * 그래서 둘은 같은 확인 절차를 거치고, 사라질 포인트를 이름까지 나열해 보여준다.
 */
import {
  AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle,
} from 'reka-ui'
import type { PostDetail } from '#shared/types/db'
import { clusterAt, DEFAULT_RADIUS, RADII, type ClusterInput } from '#shared/utils/cluster'
import { formatRange } from '#shared/utils/format'
import {
  dayRules, DEFAULT_GAP_MINUTES, END_TIME_OPTIONS, GAP_OPTIONS, shiftDate, tripDates, validateDaySettings,
  type DaySetting,
} from '#shared/utils/trip-day'

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

/** 다시 묶기 요청 — 반경과 일차 기준을 «함께» 보낸다. 한쪽만 바꿔도 다른 쪽은 지금 값 그대로다. */
interface Regroup {
  radius: number
  daySettings: DaySetting[]
}

const emit = defineEmits<{ recluster: [req: Regroup] }>()

/** 미리보기는 서버를 부르지 않는다 — 사진마다 lat/lng/shot_at 이 이미 내려와 있고
    업로드 화면과 같은 clusterAt 을 쓰므로 결과가 서버 계산과 일치한다. */
const shots = computed<ClusterInput[]>(() =>
  props.post.points
    .flatMap((p) => p.photos)
    .filter((ph) => ph.shot_at)
    .map((ph) => ({ key: String(ph.id), lat: ph.lat, lng: ph.lng, t: Date.parse(ph.shot_at!) })),
)

const currentRadius = computed(() => props.post.cluster_radius)
/** 지금 저장된 일차 기준 — 반경 미리보기도 이 기준으로 센다 (서버 재묶기와 같은 계산) */
const savedRules = computed(() => dayRules(props.post.day_settings))
const table = computed(() =>
  RADII.map((r) => ({ radius: r, count: clusterAt(shots.value, r, savedRules.value).length })),
)

/*
 * 일차 기준 — 기간의 날마다 한 줄. 「끝」은 다음 날 몇 시까지 이 일차인지, 「공백」은 같은 자리라도
 * 이만큼 비면 포인트를 나누는 기준이다. 한 일차의 끝이 곧 다음 일차의 시작이라 빈틈이 없다.
 * 고친 값은 「적용」 전까지 화면에만 있다 — 적용은 반경과 같은 재묶기다.
 */
const GAP_CHOICES = GAP_OPTIONS.map((m) => ({ value: m, text: `${m}분` }))
const END_CHOICES = END_TIME_OPTIONS.map((t) => ({ value: t, text: t }))

const savedDays = computed(() => new Map(props.post.day_settings.map((s) => [s.date, s])))
/** 사용자가 고친 일차만 담는다. 날짜 → 그 일차의 값 전체 */
const dayEdits = ref<Record<string, Required<DaySetting>>>({})

const days = computed(() => {
  const list = tripDates(startedAt.value, endedAt.value)
  return list.map((date, i) => {
    const s = dayEdits.value[date] ?? savedDays.value.get(date)
    const prev = i ? dayEdits.value[list[i - 1]!] ?? savedDays.value.get(list[i - 1]!) : undefined
    return {
      date,
      n: i + 1,
      /** 이 일차가 시작하는 시각 = 전날 일차의 끝. 첫 일차는 자정에 시작한다 */
      startTime: prev?.endTime ?? '00:00',
      endTime: s?.endTime ?? '00:00',
      gapMinutes: s?.gapMinutes ?? DEFAULT_GAP_MINUTES,
    }
  })
})

/** 적용할 모양 — 서버와 «같은 함수»로 다듬어(기본값 지움 · 날짜순) 바뀐 것이 있는지 문자열로 본다 */
const nextDaySettings = computed(() => {
  const r = validateDaySettings(days.value.map(({ date, endTime, gapMinutes }) => ({ date, endTime, gapMinutes })))
  return r.ok ? r.value : []
})
/** 화면에 보이는 일차 범위 안에서만 비교한다 — 기간 밖에 남은 옛 값 때문에 「바뀜」으로 뜨면 안 된다 */
const savedInRange = computed(() => {
  const shown = new Set(days.value.map((d) => d.date))
  return props.post.day_settings.filter((s) => shown.has(s.date))
})
const daysChanged = computed(() => JSON.stringify(nextDaySettings.value) !== JSON.stringify(savedInRange.value))

function setDay(date: string, patch: { endTime: string } | { gapMinutes: number }) {
  const cur = days.value.find((d) => d.date === date)
  if (!cur) return
  dayEdits.value = { ...dayEdits.value, [date]: { date, endTime: cur.endTime, gapMinutes: cur.gapMinutes, ...patch } }
}

/** 'YYYY-MM-DD' → '8/22' */
function md(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

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
const pending = ref<Regroup | null>(null)

const pendingCount = computed(() =>
  pending.value === null ? 0 : clusterAt(shots.value, pending.value.radius, dayRules(pending.value.daySettings)).length,
)
const pendingRadiusChanged = computed(() => !!pending.value && pending.value.radius !== currentRadius.value)
const pendingDaysChanged = computed(
  () => !!pending.value && JSON.stringify(pending.value.daySettings) !== JSON.stringify(props.post.day_settings),
)

/** 슬라이더에 보이는 값 — 확인 전에는 현재 반경을 유지한다 */
const shown = computed(() => pending.value?.radius ?? currentRadius.value ?? DEFAULT_RADIUS)

/** 반경만 바꾼다 — 일차 기준은 «저장된» 값 그대로 (화면에서 고치던 일차 값은 따로 적용한다) */
function pick(r: number) {
  if (props.dirty || props.busy) return
  if (r === currentRadius.value) return
  pending.value = { radius: r, daySettings: props.post.day_settings }
  dialogOpen.value = true
}

/** 일차 기준만 바꾼다 — 반경은 지금 값 그대로. 반경이 기록되기 전에 만든 기록은 기본 반경으로 묶는다 */
function applyDays() {
  if (props.dirty || props.busy || !daysChanged.value) return
  pending.value = { radius: currentRadius.value ?? DEFAULT_RADIUS, daySettings: nextDaySettings.value }
  dialogOpen.value = true
}

function revertDays() {
  dayEdits.value = {}
}

function confirmRecluster() {
  const req = pending.value
  // 고른 값을 «먼저» 읽고 비운다 — 아래 cancelRecluster 의 🔴 와 같은 이유로 남겨두면 안 된다.
  pending.value = null
  dialogOpen.value = false
  if (req !== null) emit('recluster', req)
}

/**
 * 🔴 취소하면 «고른 값»도 지워야 한다.
 *
 *    안 지우면 shown(= pending ?? currentRadius) 이 고른 값을 계속 보여준다. 화면은
 *    500m 인데 실제 반경은 200m 다. 게다가 원래 값을 다시 고르면 pick() 의
 *    `r === currentRadius` 에 걸려 아무 일도 안 일어나서, 입력이 죽은 것처럼 보인다.
 *    실제로 그렇게 신고가 들어왔다.
 *
 *    AlertDialogCancel 은 기본 동작으로 «닫기만» 한다 — 상태를 되돌리는 건 우리 몫이다.
 *    닫힘(update:open)에 이 정리를 걸면 안 된다: 확인 버튼도 닫으면서 지나가므로
 *    confirmRecluster 가 값을 읽기 «전에» 비워진다 (이 파일 위쪽 주석의 그 함정).
 */
function cancelRecluster() {
  pending.value = null
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

      <!--
        일차 기준 — 날마다 한 줄. 「끝」을 미루면 새벽 일정이 전날 일차에 남는다.
        한 일차의 끝이 곧 다음 일차의 시작이라 다음 줄의 시작 시각이 따라 움직인다.
      -->
      <div v-if="days.length" class="days" data-testid="settings-days">
        <div v-for="d in days" :key="d.date" class="day" :data-testid="`settings-day-${d.n}`">
          <span class="mono day-n">{{ d.n }}일차</span>
          <span class="mono day-range">{{ md(d.date) }} {{ d.startTime }} ~ {{ md(shiftDate(d.date, 1)) }} {{ d.endTime }}</span>
          <!-- 고르개 묶음은 한 덩어리로 줄바꿈한다 — 글자와 고르개가 다른 줄로 갈라지면 무엇을 고르는지 안 읽힌다 -->
          <span class="day-ctl">
            <span class="mono day-ctl-label">끝</span>
            <ChoiceSelect
              :model-value="d.endTime"
              :options="END_CHOICES"
              :label="`${d.n}일차 끝 시각`"
              :disabled="dirty || busy"
              @update:model-value="(v) => setDay(d.date, { endTime: String(v) })"
            />
            <span class="mono day-ctl-label">공백</span>
            <ChoiceSelect
              :model-value="d.gapMinutes"
              :options="GAP_CHOICES"
              :label="`${d.n}일차 공백 기준`"
              :disabled="dirty || busy"
              @update:model-value="(v) => setDay(d.date, { gapMinutes: Number(v) })"
            />
          </span>
        </div>
      </div>
      <p v-else class="mono hint">기간을 정하면 일차마다 끝 시각과 공백 기준을 고를 수 있습니다.</p>

      <div v-if="daysChanged" class="day-actions">
        <button type="button" class="btn foot ghost mono" :disabled="busy" @click="revertDays">되돌리기</button>
        <button type="button" class="btn foot primary mono" :disabled="dirty || busy" @click="applyDays">일차 기준 적용</button>
      </div>
      <p v-if="dirty && days.length" class="mono warn">
        저장하지 않은 변경이 있습니다. 먼저 저장한 뒤에 일차 기준을 바꿀 수 있습니다.
      </p>
      <p v-else-if="days.length" class="mono hint">
        끝 — 다음 날 이 시각 전까지 찍은 사진은 이 일차입니다. 공백 — 같은 자리라도 사진 사이가 이만큼 비면 포인트를 나눕니다.
        적용하면 포인트 범위처럼 사진이 다시 묶입니다.
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
        <AlertDialogOverlay class="dialog-overlay" />
        <AlertDialogContent class="dialog-alert dialog-surface" @escape-key-down="cancelRecluster">
          <AlertDialogTitle class="dialog-title">{{ pendingDaysChanged && !pendingRadiusChanged ? '일차 기준 변경' : '포인트 범위 변경' }}</AlertDialogTitle>

          <div class="dlg-diff mono">
            <template v-if="pendingRadiusChanged">
              <span>{{ currentRadius ?? '?' }}m</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
              <b>{{ pending?.radius }}m</b>
              <span class="dlg-sep">·</span>
            </template>
            <template v-if="pendingDaysChanged">
              <b>일차 기준 바뀜</b>
              <span class="dlg-sep">·</span>
            </template>
            <span>포인트 {{ post.points.length }}개</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
            <b>{{ pendingCount }}개</b>
          </div>

          <AlertDialogDescription class="dialog-description">
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

          <div class="dialog-actions">
            <AlertDialogCancel class="btn foot ghost mono" @click="cancelRecluster">취소</AlertDialogCancel>
            <AlertDialogAction class="btn foot danger mono" @click="confirmRecluster">
              {{ atRisk.length ? '바꾸고 지우기' : '다시 묶기' }}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  </div>
</template>

<style scoped>
.settings { flex: 1; min-height: 0; padding: 20px 24px 28px; display: flex; flex-direction: column; gap: 22px; }
/* 판 폭을 그대로 쓴다 — 예전엔 680px 로 묶여 있어서 넓은 화면에서 오른쪽이 통째로 비었다 */
.block { display: flex; flex-direction: column; gap: 10px; }

/* 기간 — 고르개 하나 + 「EXIF 값으로」. 좁아지면 되돌리기 버튼이 아래로 내려간다 */
.period { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.revert {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  font-size: var(--fs-xs);
  color: var(--mid);
  cursor: pointer;
}
.revert:hover { background: rgb(var(--acc-rgb) / 0.1); }

/* 일차 기준 — 날마다 한 줄. 좁으면 범위 글자 아래로 고르개가 내려간다 */
.days {
  display: flex;
  flex-direction: column;
  background: rgb(var(--s1-rgb) / 0.7);
  border: 1px solid var(--hair);
  border-radius: var(--radius);
}
.day { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; padding: 10px 12px; }
.day + .day { border-top: 1px solid var(--hair-soft); }
.day-n { min-width: 4ch; font-size: var(--fs-sm); color: var(--ink); }
/* 날짜·시각은 데이터 — tabular-nums 로 줄마다 자릿수가 맞는다 (--font-mono) */
.day-range { flex: 1 1 auto; font-size: var(--fs-xs); color: var(--deep); font-variant-numeric: tabular-nums; }
.day-ctl { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.day-ctl-label { font-size: var(--fs-xs); color: var(--faint); }
/* 오른쪽 정렬 · 가장 오른쪽이 주 동작 */
.day-actions { display: flex; justify-content: flex-end; gap: 8px; }
.warn { font-size: var(--fs-2xs); color: var(--danger); }

.bhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.blabel { font-family: var(--font-body); font-size: var(--fs-sm); letter-spacing: 0.02em; color: var(--ink); }
.bnow { font-size: var(--fs-xs); color: var(--deep); }

.field { display: flex; flex-direction: column; gap: 7px; }
/* 입력은 base.css 의 .input 한 벌을 쓴다 */

.switch { position: relative; display: flex; align-items: center; gap: 11px; cursor: pointer; }
.switch input { position: absolute; width: 42px; height: 24px; margin: 0; opacity: 0; cursor: pointer; }
.track { position: relative; display: block; width: 42px; height: 24px; flex: none; border-radius: 999px; background: rgb(var(--mid-rgb) / 0.2); transition: background-color var(--duration-fast) var(--ease-out); }
.knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--mid); transition: transform var(--duration-normal) var(--ease-out), background-color var(--duration-fast) var(--ease-out); }
.switch input:checked ~ .track { background: rgb(var(--acc-rgb) / 0.9); }
.switch input:checked ~ .track .knob { transform: translateX(18px); background: var(--s0); }
.switch input:focus-visible ~ .track { box-shadow: var(--focus-ring); }
.switch-text { font-size: var(--fs-md); color: var(--mid); }


.rwrap {
  background: rgb(var(--s1-rgb) / 0.7);
  border: 1px solid rgb(var(--mid-rgb) / 0.16);
  border-radius: var(--radius);
  padding: 14px 16px 10px;
}
/* 저장 안 된 변경이 있으면 반경을 못 바꾼다 — 눌리지 않는 이유는 아래 문구가 말한다 */
.rwrap.locked { opacity: 0.45; pointer-events: none; }
.hint { font-size: var(--fs-2xs); line-height: 1.7; color: var(--faint); }
.warn { font-size: var(--fs-2xs); line-height: 1.7; color: var(--danger); }

.dlg-diff { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--deep); }
.dlg-diff b { color: var(--ink); font-size: var(--fs-md); }
.dlg-sep { color: var(--faint); }

.lose { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 10px 12px; list-style: none; background: rgb(var(--danger-rgb) / 0.07); border: 1px solid rgb(var(--danger-rgb) / 0.3); border-radius: var(--radius); }
.lose li { display: flex; align-items: baseline; gap: 10px; }
.lose-name { font-size: var(--fs-md); color: var(--ink); }
.lose-detail { margin-left: auto; font-size: var(--fs-2xs); color: var(--danger); }

.dlg-note { font-size: var(--fs-2xs); line-height: 1.7; color: var(--faint); }
/* 버튼은 base.css 의 .btn / .btn.foot 한 벌을 쓴다 */

@media (max-width: 900px) {
  .settings { padding: 16px 16px calc(var(--cta-h) + env(safe-area-inset-bottom)); gap: 20px; }
  /* 문서가 굴러가는 화면에서는 이 칸이 스크롤러 노릇을 하지 않는다 — 제 높이를 갖고
     문서를 길게 만든다 (composables/useDocScroll.ts).

     🔴 overflow 만 열면 부족하다. .scroll-y 가 얹어둔 overscroll-behavior-y: contain 과
        touch-action: pan-y 가 «그대로 남아» 손가락 제스처가 문서로 이어지지 못했다.
        밀리긴 하는데 매번 제자리로 돌아오는 증상이 이것이었다 — 같은 구조인 실험대는
        멀쩡했고, 두 페이지의 조상 사슬을 비교해 이 두 줄만 다른 것을 찾았다:
          실험대   osb=auto   ta=auto
          편집화면 osb=contain ta=pan-y   ← .scroll-y 의 잔재
        스크롤 상자가 아니게 되었으니 사슬을 막을 이유도, 축을 제한할 이유도 없다. */
  html.doc-scroll .settings {
    overflow: visible;
    flex: none;
    min-height: auto;
    overscroll-behavior: auto;
    touch-action: auto;
  }
  /* 「EXIF 값으로」는 자기 줄로 내려간다 */
  .revert { flex: 1 1 100%; }
  .revert { min-height: 44px; }
}
</style>
