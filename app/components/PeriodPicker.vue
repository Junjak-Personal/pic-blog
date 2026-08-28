<script setup lang="ts">
/**
 * 기간 고르개 — 편집 1단계 「기간」. 시작·종료를 한 번에 고른다.
 *
 * 네이티브 <input type="date"> 두 칸을 대신한다. 그쪽은 iOS 에서 글자를 16px 아래로
 * 못 내리고(그 미만이면 초점 잡을 때 화면이 강제 확대된다) 두 칸이 화면 폭을 거의
 * 다 먹었다. 여기서는 «버튼» 하나라 그 제약을 안 받는다.
 *
 * 🔴 세그먼트 입력(DateRangePickerField/Input)은 일부러 안 쓴다. 손가락으로 연·월·일을
 *    하나씩 치는 건 달력에서 이틀 찍는 것보다 느리고, 그 세그먼트들은 다시 «입력»이라
 *    16px 제약이 그대로 돌아온다. 트리거는 읽기 전용이고 고르는 것은 달력이 맡는다.
 *
 * 달력 스타일은 assets/css/menu.css 에 있다 — Content 가 내용을 body 로 옮기므로
 * scoped 스타일이 닿지 않는다 (OverflowMenu · CurrencySelect 와 같은 이유).
 */
import {
  DateRangePickerCalendar, DateRangePickerCell, DateRangePickerCellTrigger, DateRangePickerContent,
  DateRangePickerGrid, DateRangePickerGridBody, DateRangePickerGridHead, DateRangePickerGridRow,
  DateRangePickerHeadCell, DateRangePickerHeader, DateRangePickerHeading, DateRangePickerNext,
  DateRangePickerPrev, DateRangePickerRoot, DateRangePickerTrigger,
} from 'reka-ui'
import { CalendarDate, type DateValue } from '@internationalized/date'

/** 둘 다 'YYYY-MM-DD' 이고, 비어 있으면 '' 다 (기간을 아직 안 정한 기록). */
const startedAt = defineModel<string>('startedAt', { required: true })
const endedAt = defineModel<string>('endedAt', { required: true })

function toCal(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? new CalendarDate(Number(m[1]), Number(m[2]), Number(m[3])) : undefined
}

function toStr(d: DateValue | undefined) {
  if (!d) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.year}-${p(d.month)}-${p(d.day)}`
}

/**
 * 두 문자열 모델과 reka 의 DateRange 사이를 잇는다.
 * 🔴 set 에서 start/end 를 «둘 다» 쓴다. 범위를 다시 고르는 도중에는 end 가 잠깐
 *    undefined 인데, 그때 start 만 갱신하면 종료일이 옛 값으로 남아 시작>종료가 된다.
 */
const range = computed({
  get: () => ({ start: toCal(startedAt.value), end: toCal(endedAt.value) }),
  set: (v) => {
    startedAt.value = toStr(v?.start)
    endedAt.value = toStr(v?.end)
  },
})

/**
 * 트리거 글자는 저장되는 값 그대로 YYYY-MM-DD 다.
 * 시작만 찍고 종료를 아직 안 찍은 중간 상태가 있으므로 (범위는 두 번 눌러 정해진다)
 * 그때는 시작 하나만 보여준다.
 */
const label = computed(() => {
  const s = startedAt.value
  const e = endedAt.value
  if (!s && !e) return '기간 없음'
  if (!s || !e) return s || e
  return s === e ? s : `${s} – ${e}`
})
</script>

<template>
  <!-- closeOnSelect 는 기본 false 다 — 시작을 찍은 뒤 종료를 찍을 때까지 열려 있어야 한다 -->
  <DateRangePickerRoot v-model="range" locale="ko-KR">
    <DateRangePickerTrigger class="periodtrigger mono" data-testid="settings-period-trigger">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" /><path d="M16 3l0 4" /><path d="M8 3l0 4" /><path d="M4 11l16 0" /></svg>
      <span class="periodtext">{{ label }}</span>
    </DateRangePickerTrigger>

    <DateRangePickerContent class="cal-content" :side-offset="6" :collision-padding="12">
      <DateRangePickerCalendar v-slot="{ weekDays, grid }" class="cal">
        <DateRangePickerHeader class="cal-head">
          <DateRangePickerPrev class="cal-nav" aria-label="이전 달">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
          </DateRangePickerPrev>
          <DateRangePickerHeading class="cal-title mono" />
          <DateRangePickerNext class="cal-nav" aria-label="다음 달">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6" /></svg>
          </DateRangePickerNext>
        </DateRangePickerHeader>

        <DateRangePickerGrid v-for="month in grid" :key="month.value.toString()" class="cal-grid">
          <DateRangePickerGridHead>
            <DateRangePickerGridRow>
              <DateRangePickerHeadCell v-for="day in weekDays" :key="day" class="cal-hcell mono">
                {{ day }}
              </DateRangePickerHeadCell>
            </DateRangePickerGridRow>
          </DateRangePickerGridHead>
          <DateRangePickerGridBody>
            <DateRangePickerGridRow v-for="(week, i) in month.rows" :key="i">
              <DateRangePickerCell v-for="day in week" :key="day.toString()" :date="day" class="cal-cell">
                <DateRangePickerCellTrigger :day="day" :month="month.value" class="cal-day mono" />
              </DateRangePickerCell>
            </DateRangePickerGridRow>
          </DateRangePickerGridBody>
        </DateRangePickerGrid>
      </DateRangePickerCalendar>
    </DateRangePickerContent>
  </DateRangePickerRoot>
</template>

<style scoped>
/* 트리거는 «버튼»이다 — 입력이 아니라서 iOS 의 16px 확대 규칙에 걸리지 않는다 */
.periodtrigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 12px;
  background: var(--field);
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
}
.periodtrigger:hover { border-color: rgba(146, 178, 169, 0.34); }
.periodtrigger:focus-visible { border-color: var(--focus-border); box-shadow: var(--focus-ring); outline: none; }
.periodtrigger[data-state='open'] { border-color: var(--focus-border); }
.periodtrigger svg { flex: none; color: var(--deep); }
.periodtext { letter-spacing: 0.02em; }

@media (max-width: 900px) {
  /* 엄지로 누른다. 글자는 13px 그대로여도 된다 — button 이라 확대 대상이 아니다. */
  .periodtrigger { min-height: 44px; }
}
</style>
