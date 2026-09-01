<script setup lang="ts">
/**
 * 아트보드 1b 우측 레일 — 포인트 목록. 마커와 서로 하이라이트한다.
 *
 * 날짜 탭이 이 화면의 «범례»이기도 하다 — 탭의 색 점이 곧 그 날짜의 마커·번호 색이다.
 * 번호는 날짜마다 01 로 되돌아가므로(shared/utils/days.ts) 색과 날짜 구분줄이 없으면
 * 「전체」에서 01 이 두 개 보인다. 셋은 같이 다녀야 한다.
 */
import type { Point } from '#shared/types/db'
import type { DayGroup, PointBadge } from '#shared/utils/days'
import { formatDate, formatTime } from '#shared/utils/format'

const props = defineProps<{
  groups: DayGroup<Point>[]
  badges: Map<number, PointBadge>
  /** null = 전체 탭 */
  activeDay: string | null
  activeId: number | null
  camera: string | null
  format: string | null
  /** 모바일은 행 클릭 = 강조만, 우측 전용 버튼만 상세로 (아트보드 1b 인터랙션 규칙 2) */
}>()

const emit = defineEmits<{ select: [id: number]; open: [id: number]; pickDay: [date: string | null] }>()

const listEl = useTemplateRef<HTMLElement>('listEl')

/** 하루짜리 기록에는 탭도 구분줄도 없다 — 나눌 것이 없는데 UI 만 늘어난다 */
const multiDay = computed(() => props.groups.length > 1)
const shownGroups = computed(() =>
  props.activeDay === null ? props.groups : props.groups.filter((g) => g.date === props.activeDay),
)
const shownCount = computed(() => shownGroups.value.reduce((n, g) => n + g.points.length, 0))

/** 마커에서 선택되면 목록이 해당 행으로 스크롤한다 */
watch(() => props.activeId, async (id) => {
  if (id == null) return
  await nextTick()
  listEl.value?.querySelector<HTMLElement>(`[data-row="${id}"]`)?.scrollIntoView({
    block: 'nearest',
    behavior: 'smooth',
  })
})

/*
 * 행 클릭은 «고르기»까지다 — 상세는 오른쪽 ›(chevron) 가 연다.
 *
 * 예전에는 데스크탑에서 행 하나를 누르면 곧바로 상세가 덮였다. 그런데 목록을 훑는
 * 동작의 대부분은 「이게 지도 어디지?」이지 「본문을 읽자」가 아니다 — 지도에 대표 사진이
 * 뜨는 지금은 더 그렇다. 매번 시트가 올라오면 그걸 닫아야 다음 행을 볼 수 있었다.
 * 두 뜻을 두 자리로 나눈다.
 */
function onRow(id: number) {
  emit('select', id)
}

/** 탭 라벨은 '08.22' — 연도는 상단바 기간이 이미 말한다 */
function tabLabel(g: DayGroup<Point>) {
  return g.date ? formatDate(g.date).slice(5) : '미상'
}

function dayLabel(g: DayGroup<Point>) {
  return g.n ? `${g.n}일차` : '날짜 미상'
}
</script>

<template>
  <aside class="rail">
    <header class="head">
      <span class="mono title">포인트 {{ shownCount }}</span>
      <span class="mono sub">촬영 시각 순</span>
    </header>

    <!-- 날짜 탭 = 범례. 색 점이 마커·번호 색과 같은 값이다 -->
    <nav v-if="multiDay" class="tabs" aria-label="날짜">
      <button
        type="button"
        class="mono tab"
        :class="{ on: props.activeDay === null }"
        :aria-pressed="props.activeDay === null"
        @click="emit('pickDay', null)"
      >
        전체
      </button>
      <button
        v-for="g in props.groups"
        :key="g.date"
        type="button"
        class="mono tab"
        :class="{ on: props.activeDay === g.date }"
        :style="{ '--day': g.color }"
        :aria-pressed="props.activeDay === g.date"
        :aria-label="`${dayLabel(g)} ${formatDate(g.date)} · ${g.points.length}개`"
        @click="emit('pickDay', g.date)"
      >
        <span class="dot" />
        {{ tabLabel(g) }}
      </button>
    </nav>

    <ol ref="listEl" class="scroll-y list">
      <template v-for="g in shownGroups" :key="g.date">
        <li v-if="multiDay" class="sep" :style="{ '--day': g.color }">
          <span class="dot" />
          <span class="mono sep-day">{{ dayLabel(g) }}</span>
          <span class="mono sep-date">{{ formatDate(g.date) }}</span>
          <span class="mono sep-count">{{ g.points.length }}개</span>
        </li>

        <li
          v-for="p in g.points"
          :key="p.id"
          :data-row="p.id"
          class="row"
          :class="{ on: p.id === props.activeId }"
          :style="{ '--day': g.color }"
          @click="onRow(p.id)"
        >
          <span class="mono num">{{ props.badges.get(p.id)?.label }}</span>
          <span class="main">
            <span class="name">{{ props.badges.get(p.id)?.name }}</span>
            <span class="mono sub2">{{ formatTime(p.first_shot_at) }} · {{ p.photos.length }}장</span>
          </span>
          <button
            type="button"
            class="open"
            :aria-label="`${props.badges.get(p.id)?.name} 상세 열기`"
            @click.stop="emit('open', p.id)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6" /></svg>
          </button>
        </li>
      </template>
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
  background: rgb(var(--s1-rgb) / 0.92);
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
.title { font-size: var(--fs-2xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--mid); }
.sub { font-size: var(--fs-2xs); color: var(--faint); }

/* 날짜가 많으면 가로로 밀린다 — 세로로 접으면 그만큼 목록이 짧아진다 */
.tabs {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px 10px 18px;
  border-bottom: 1px solid var(--hair);
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: 999px;
  background: rgb(var(--field-rgb) / 0.7);
  font-size: var(--fs-2xs);
  color: var(--deep);
  cursor: pointer;
  white-space: nowrap;
}
.tab:hover { background: rgb(var(--ink-rgb) / 0.07); }
.tab.on { background: var(--ink); border-color: var(--ink); color: var(--s0); font-weight: 600; }
.dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--day, var(--acc)); }

.list { flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; }

/* 날짜 구분줄 — 「전체」에서 같은 번호가 두 번 나오는 이유를 여기서 말한다.
   날짜 표시는 탭과 같은 «색 점» 하나로 통일한다 — 왼쪽 색 띠를 쓰던 걸 걷어냈다.
   같은 화면에서 색을 말하는 방식이 점·띠 둘로 갈리면 띠가 장식으로 읽힌다. */
.sep {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 18px;
  background: rgb(var(--s1-rgb) / 0.97);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--hair-soft);
}
.sep-day { font-size: var(--fs-2xs); letter-spacing: 0.1em; color: var(--day); }
.sep-date { font-size: var(--fs-micro); color: var(--faint); }
.sep-count { margin-left: auto; font-size: var(--fs-micro); color: var(--faint); }

.row {
  display: grid;
  grid-template-columns: 28px 1fr 28px;
  gap: 11px;
  align-items: center;
  padding: 11px 14px 11px 18px;
  border-bottom: 1px solid var(--hair-soft);
  cursor: pointer;
}
.row:hover { background: rgb(var(--ink-rgb) / 0.06); }
.row.on { background: rgb(var(--ink-rgb) / 0.1); }

.num {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: var(--fs-2xs);
  font-weight: 600;
  background: rgb(var(--marker-rgb) / 0.94);
  color: var(--day, var(--mid));
  border: 1px solid var(--day, rgb(var(--acc-rgb) / 0.55));
}
/* 상태는 «링 → 채움»으로만 말한다. 색은 두 상태에서 같은 날짜 색이라
   고른 행에서도 며칠차가 그대로 읽힌다 (예전엔 흰색으로 덮여 날짜가 사라졌다). */
.row.on .num { background: var(--day, var(--ink)); color: var(--s0); border-color: var(--day, var(--ink)); }

.main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.name {
  font-size: var(--fs-lg);
  line-height: 1.2;
  color: var(--mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row.on .name { color: var(--ink); }
.sub2 { font-size: var(--fs-2xs); color: var(--faint); white-space: nowrap; }

.open {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
  color: var(--deep);
  cursor: pointer;
}
.open:hover { background: rgb(var(--acc-rgb) / 0.14); }

.foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-top: 1px solid var(--hair);
  font-size: var(--fs-2xs);
  color: var(--faint);
}
.cam { display: flex; align-items: center; gap: 6px; }

/* 모바일: 터치 타깃 40×44 (아트보드 1b 인터랙션 규칙 2) */
@media (max-width: 900px) {
  .rail { border-left: 0; border-top: 1px solid rgb(var(--acc-rgb) / 0.28); }
  .tabs { padding: 8px 12px 8px 16px; }
  /* 손가락으로 고르는 칩이다 — 28px 은 작다 */
  .tab { min-height: 32px; padding: 0 12px; }
  .row { grid-template-columns: 24px 1fr 40px; padding: 10px 8px 10px 16px; }
  .sep { padding: 6px 12px 6px 16px; }
  .num { width: 23px; height: 23px; font-size: var(--fs-micro); }
  .name { font-size: var(--fs-md); }
  .open { width: 40px; height: 44px; }
}
</style>
