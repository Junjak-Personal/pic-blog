<script setup lang="ts">
/**
 * 포스트 뷰 — 아트보드 1b. 공개 경로라 절대 잠기지 않는다.
 * 지도 + 목록 → 마커 선택 → 스캐터 상세 → 사진 확대, 네 층이 한 화면에서 겹친다.
 */
import AppBack from '~/components/AppBack.vue'
import MapSkeleton from '~/components/MapSkeleton.vue'
// 날짜 탭이 지도를 그 날짜 범위로 다시 담아야 해서 fit() 을 직접 부른다 — 타입 때문에 명시적 임포트
import TripMap from '~/components/TripMap.vue'
import type { PostDetail } from '#shared/types/db'
// 자동 임포트에 기대지 않는다 — unimport 스캐너가 연속된 `export const` 중 두 번째부터 놓친다
import { badgesOf, groupByDay } from '#shared/utils/days'
import { formatKm, formatOf, formatRange } from '#shared/utils/format'
import { formatMoney, totalsOf } from '#shared/utils/extras'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
/** 편집 진입은 로그인한 사람에게만 보인다 — 읽는 사람에게는 없는 문이다 */
const { loggedIn } = useUserSession()

const { data: post, error, status } = useFetch<PostDetail>(() => `/api/posts/${slug.value}`, { lazy: true })

const activeId = ref<number | null>(null)
const detailOpen = ref(false)
const stageEl = useTemplateRef<HTMLElement>('stageEl')
const mapEl = useTemplateRef<InstanceType<typeof TripMap>>('mapEl')
/** 잘린 제목 전체를 보여주는 판. 네이티브 <dialog> — 포커스 가둠·ESC·배경은 브라우저가 한다 */
const titleDlg = useTemplateRef<HTMLDialogElement>('titleDlg')
/** 소비 금액 — 화폐가 늘면 헤더가 자라므로 값은 판에서 본다 */
const spendDlg = useTemplateRef<HTMLDialogElement>('spendDlg')
const stageHeight = ref(0)

/**
 * 시트 높이를 JS 가 소유한다 — CSS 에 같은 상수를 또 쓰면 지도 오프셋 계산과 어긋난다.
 * 데스크탑은 언제나 무대의 80% 다. 예전엔 아트보드 1b 의 720px 로 «천장»을 씌웠는데,
 * 세로가 긴 화면에서는 시트가 화면에 비해 납작해 보였다 — 사진이 주인공인 판이라
 * 비율로 따라가는 쪽이 맞다. 모바일은 전체를 덮는다.
 */
const sheetHeight = computed(() => {
  if (!stageHeight.value) return 0
  return isMobile.value ? stageHeight.value : Math.round(stageHeight.value * 0.8)
})
const photoIndex = ref<number | null>(null)
const isMobile = ref(false)

const points = computed(() => post.value?.points ?? [])

/**
 * 날짜 층 — 포인트를 촬영 날짜로 나눈다 (shared/utils/days.ts).
 * 탭이 곧 필터다: 고른 날짜의 포인트만 지도·레일·앞뒤 이동에 남는다.
 * 번호는 날짜마다 01 로 되돌아가고 색이 며칠차인지를 말한다 — 배지는 한 곳(badges)에서만 만든다.
 */
const dayGroups = computed(() => groupByDay(points.value))
const badges = computed(() => badgesOf(dayGroups.value))

/**
 * 이 기록의 소비 금액 — 포인트마다 적어둔 것을 화폐별로 합친다.
 * 적은 것이 하나도 없으면 빈 배열이라 그 줄 자체가 뜨지 않는다.
 */
const spendTotals = computed(() => totalsOf(points.value.flatMap((p) => p.expenses)))
/** 그 합계가 «어디서» 왔는지 — 포인트마다 적어둔 항목 그대로. 배지 색·번호는 레일과 같은 값이다. */
const spendByPoint = computed(() =>
  points.value
    .filter((p) => p.expenses.length)
    .map((p) => {
      const b = badges.value.get(p.id)
      return { id: p.id, label: b?.label ?? '', name: b?.name ?? '', color: b?.color, items: p.expenses }
    }),
)
/** null = 전체 */
const activeDay = ref<string | null>(null)
const visiblePoints = computed(() =>
  activeDay.value === null
    ? points.value
    : dayGroups.value.find((g) => g.date === activeDay.value)?.points ?? points.value,
)

const activePoint = computed(() => visiblePoints.value.find((p) => p.id === activeId.value) ?? null)
const activeBadge = computed(() => (activeId.value === null ? null : badges.value.get(activeId.value) ?? null))

/** 앞뒤 포인트 — 보이는 목록 기준이라 날짜 탭이 이동 범위도 정한다 */
const stepIndex = computed(() => visiblePoints.value.findIndex((p) => p.id === activeId.value))
const prevPoint = computed(() => (stepIndex.value > 0 ? visiblePoints.value[stepIndex.value - 1] ?? null : null))
const nextPoint = computed(() => (stepIndex.value < 0 ? null : visiblePoints.value[stepIndex.value + 1] ?? null))
const prevName = computed(() => (prevPoint.value ? badges.value.get(prevPoint.value.id)?.name ?? null : null))
const nextName = computed(() => (nextPoint.value ? badges.value.get(nextPoint.value.id)?.name ?? null : null))

/** 대표 촬영 기기 — 레일 하단 표기 (아트보드 1b) */
const lead = computed(() => points.value[0]?.photos[0] ?? null)
const cameraLabel = computed(() => lead.value?.camera ?? null)
// w 는 바이트 PUT 이 채운다 — 업로드 도중에 열면 아직 0 이라 라벨을 접는다.
// 포맷은 실제 저장된 확장자에서 뽑는다 (아이폰 업로드는 JPEG 다).
/** 모바일 상단바에서 통계를 접어둔다 — 4칸이 타이틀을 밀어내 「2026.0…」 로 잘렸다 */
const showStats = ref(false)

const formatLabel = computed(() =>
  lead.value?.w ? `${Math.max(lead.value.w, lead.value.h)}px ${formatOf(lead.value.display_path) ?? ''}`.trim() : null,
)

/** 1c 「비공개 기록입니다」 — 403 이 통계와 기간을 함께 준다 */
interface PrivatePayload {
  private: true
  title: string
  point_count: number
  photo_count: number
  started_at: string | null
  ended_at: string | null
}
const privateInfo = computed<PrivatePayload | null>(() => {
  const data: unknown = error.value?.data
  if (typeof data !== 'object' || data === null) return null
  const d = data as { data?: unknown }
  const inner = d.data
  if (typeof inner !== 'object' || inner === null || !('private' in inner)) return null
  return inner as PrivatePayload
})

function syncViewport() {
  isMobile.value = window.matchMedia('(max-width: 900px)').matches
  stageHeight.value = stageEl.value?.clientHeight ?? 0
}

/*
 * 🔴 무대 높이는 «무대가 생길 때» 재야 한다. onMounted 한 번으로는 못 잰다.
 *
 * useFetch 가 lazy 라, 목록에서 눌러 들어오면 첫 렌더는 스켈레톤 갈래다 — 그 순간
 * ref="stageEl" 이 붙은 진짜 무대는 아직 없어서 높이가 0 으로 남고, 데이터가 도착해
 * 무대가 생겨도 아무도 다시 재지 않는다. 그러면 시트에 height 가 안 붙어(0) 내용
 * 높이로 쪼그라든다 — 1440×1000 에서 시트가 1155 여야 할 자리에 240 으로 떴다.
 * 새로고침으로 들어오면 서버 렌더에 데이터가 실려 있어 처음부터 진짜 무대라 멀쩡했다.
 *
 * ResizeObserver 는 붙는 «순간»에도 한 번 부르므로 「생겼을 때」와 「크기가 바뀔 때」를
 * 한 번에 덮는다.
 */
let stageWatch: ResizeObserver | null = null
watch(stageEl, (el) => {
  stageWatch?.disconnect()
  stageWatch = null
  if (!el) return
  stageWatch = new ResizeObserver(() => { stageHeight.value = el.clientHeight })
  stageWatch.observe(el)
}, { immediate: true })

onMounted(async () => {
  await nextTick()
  syncViewport()
  window.addEventListener('resize', syncViewport)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
  stageWatch?.disconnect()
})

function select(id: number) {
  activeId.value = id
}

/**
 * 아트보드 1b 모바일 규칙 1 — 마커 첫 탭은 하이라이트만, 다시 탭하면 상세로.
 * 마커가 26px 라 첫 탭에서 바로 화면이 바뀌면 오탭이 잦다. 데스크탑은 한 번에 연다.
 */
function onMarker(id: number) {
  if (!isMobile.value) {
    open(id)
    return
  }
  if (activeId.value === id) open(id)
  else select(id)
}

function open(id: number) {
  activeId.value = id
  detailOpen.value = true
}

function closeDetail() {
  detailOpen.value = false
  photoIndex.value = null
}

/**
 * 날짜 탭. 고른 날짜 밖에 있던 선택은 놓는다 — 안 보이는 포인트가 선택된 채로 남으면
 * 상세 시트와 지도가 서로 다른 날짜를 가리킨다. 선택을 놓은 다음 그 날짜 전체를 다시 담는다.
 */
async function pickDay(date: string | null) {
  activeDay.value = date
  if (!visiblePoints.value.some((p) => p.id === activeId.value)) {
    activeId.value = null
    closeDetail()
  }
  await nextTick()
  if (activeId.value === null) mapEl.value?.fit(true)
}

/**
 * 앞뒤 포인트로. 상세 시트의 ‹ › 와 라이트박스 끝에서의 스와이프가 같이 쓴다 —
 * 사진 확대 중이었다면 새 포인트에서도 확대를 유지하고, 넘어온 방향의 «첫» 사진에 선다.
 */
function stepPoint(dir: -1 | 1) {
  const next = dir === 1 ? nextPoint.value : prevPoint.value
  if (!next) return
  activeId.value = next.id
  if (photoIndex.value !== null) {
    photoIndex.value = dir === 1 ? 0 : Math.max(0, next.photos.length - 1)
  }
}

useHead(() => ({
  title: post.value ? `${post.value.title} · pic·blog` : 'pic·blog',
}))
</script>

<template>
  <!--
    불러오는 중. 목록에서 이 화면으로 넘어오는 사이를 덮는다 — lazy 라 라우팅이 막히지
    않으므로 그 «사이»가 실제로 보인다. 지도·레일 두 칸을 미리 잡아두면 도착했을 때
    레이아웃이 튀지 않는다. (서버 렌더에는 이미 데이터가 실려 있어 이 갈래를 안 탄다.)
  -->
  <main v-if="status === 'pending'" class="page">
    <header class="topbar">
      <div class="left">
        <AppBack always fallback="/" label="기록 목록으로" />
        <span class="sk sk-title" aria-hidden="true" />
      </div>
    </header>

    <div class="stage" role="status" aria-label="기록을 불러오는 중">
      <div class="mapslot">
        <MapSkeleton />
      </div>
      <div class="rail sk-rail" aria-hidden="true">
        <span v-for="i in 7" :key="i" class="sk-line-row">
          <span class="sk sk-num" />
          <span class="sk sk-bar" />
        </span>
      </div>
    </div>
  </main>

  <!-- 비공개 기록 (아트보드 1c) -->
  <main v-else-if="privateInfo" class="state">
    <span class="state-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></svg>
    </span>
    <h3>비공개 기록입니다</h3>
    <p>이 링크는 작성자가 공개로 바꾸면 열립니다. 좌표와 사진은 공개 전까지 서버에만 남습니다.</p>
    <span class="mono state-stat">
      {{ privateInfo.point_count }} 포인트 · {{ privateInfo.photo_count }}장
      <template v-if="privateInfo.started_at">
        · {{ formatRange(privateInfo.started_at, privateInfo.ended_at) }}
      </template>
    </span>
    <NuxtLink to="/" class="mono back-link">기록 목록으로</NuxtLink>
  </main>

  <!-- 없는 기록 -->
  <main v-else-if="error || !post" class="state">
    <h3>기록을 찾을 수 없습니다</h3>
    <NuxtLink to="/" class="mono back-link">기록 목록으로</NuxtLink>
  </main>

  <main v-else class="page">
    <header class="topbar">
      <div class="left">
        <AppBack always fallback="/" label="기록 목록으로" />
        <!--
          제목은 한 줄로 자른다. 잘린 전체는 눌러서 본다 — 목록·상단바 어디서도 제목이
          두 줄로 흐르지 않게 하되, 전체를 볼 길은 남긴다.
          모바일 롱프레스 툴팁을 안 쓰는 이유: 텍스트 위 롱프레스는 iOS 선택·확대경과 겹친다.
        -->
        <h1 class="title-h">
          <button type="button" class="title" @click="titleDlg?.showModal()">
            <!--
              🔴 자르는 것은 이 span 이다. button 에 text-overflow: ellipsis 를 걸면 «안 먹는다» —
                 버튼 내용은 익명 상자라 말줄임표가 안 붙고, 글자가 양쪽으로 넘쳐 앞이 잘린다.
                 (390px 에서 실측: 자연 폭 304 · 상자 265 인데 「…」 없이 앞머리가 사라졌다.)
            -->
            <span class="title-text">{{ post.title }}</span>
          </button>
        </h1>
      </div>

      <!--
        오른쪽 묶음. 예전엔 [왼쪽][ⓘ][통계][편집] 넷이 space-between 으로 흩어져서
        통계가 헤더 한가운데 떠 있었다 — 헤더는 두 덩어리다: 왼쪽은 「어디에 있나」,
        오른쪽은 「이 기록은 무엇인가 + 무엇을 할 수 있나」.
      -->
      <div class="right">
        <!-- 모바일 전용: 통계는 접고 아이콘으로 연다 -->
        <button
          type="button"
          class="stats-toggle"
          :aria-expanded="showStats"
          aria-controls="post-stats"
          aria-label="기록 정보"
          :class="{ hidden: detailOpen }"
          @click="showStats = !showStats"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" /></svg>
        </button>

        <div id="post-stats" class="stats mono" :class="{ open: showStats }">
          <span v-if="post.started_at" class="stat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" /><path d="M16 3l0 4" /><path d="M8 3l0 4" /><path d="M4 11l16 0" /></svg>
            {{ formatRange(post.started_at, post.ended_at) }}
          </span>
          <span class="stat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
            {{ post.point_count }} 포인트
          </span>
          <span class="stat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4" /><path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5" /></svg>
            {{ formatKm(post.distance_km) }} km
          </span>
          <span class="stat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg>
            {{ post.photo_count }}장
          </span>

          <!--
            헤더에는 「소비 금액」 한 칸만 둔다. 화폐별 금액을 여기 늘어놓으면 화폐가 늘 때마다
            줄이 하나씩 붙어 헤더가 자란다 (실제로 두 줄이 됐다) — 값은 눌러서 판으로 본다.
          -->
          <button
            v-if="spendTotals.length"
            type="button"
            class="stat spend"
            @click="spendDlg?.showModal()"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M18 11v-2a2 2 0 0 0 -2 -2h-10a2 2 0 0 0 0 4h1" /><path d="M17 14v.01" /></svg>
            소비 금액
          </button>

          <!-- 좁은 화면 — 이 판이 「기록 정보」다. 편집으로 가는 문도 여기 둔다 -->
          <NuxtLink v-if="loggedIn" :to="`/editor/${slug}`" class="mono edit-link narrow-only">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>
            기록 편집
          </NuxtLink>
        </div>

        <!-- 넓은 화면 — 헤더 가장 오른쪽 -->
        <NuxtLink v-if="loggedIn" :to="`/editor/${slug}`" class="mono edit-link wide-only">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>
          기록 편집
        </NuxtLink>
      </div>
    </header>

    <div ref="stageEl" class="stage">
      <TripMap
        ref="mapEl"
        :points="visiblePoints"
        :badges="badges"
        :active-id="activeId"
        :bottom-inset="detailOpen ? sheetHeight : 0"
        @select="onMarker"
      />

      <PointRail
        class="rail safe-bottom"
        :groups="dayGroups"
        :badges="badges"
        :active-day="activeDay"
        :active-id="activeId"
        :camera="cameraLabel"
        :format="formatLabel"
        :mobile="isMobile"
        @select="select"
        @open="open"
        @pick-day="pickDay"
      />

      <Transition name="sheet">
        <PointDetail
          v-if="detailOpen && activePoint && activeBadge"
          class="detail"
          :style="!isMobile && sheetHeight ? { height: `${sheetHeight}px` } : undefined"
          :point="activePoint"
          :badge="activeBadge"
          :prev-name="prevName"
          :next-name="nextName"
          :mobile="isMobile"
          @close="closeDetail"
          @open-photo="photoIndex = $event"
          @step="stepPoint"
        />
      </Transition>
    </div>

    <!-- 소비 금액 — 화폐별 합계. 헤더는 이름만 말하고 값은 여기서 본다 -->
    <dialog ref="spendDlg" class="titledlg" aria-label="소비 금액">
      <h2 class="mono dlg-head">소비 금액</h2>
      <!--
        합계만 보여주면 「4,455원」이 어디서 나온 값인지 알 길이 없다 —
        포인트마다 적어둔 항목을 그대로 펼쳐 두고 그 아래 합계를 놓는다.
      -->
      <ul class="scroll-y spendlist">
        <li v-for="row in spendByPoint" :key="row.id" class="spendrow">
          <span class="mono spend-badge" :style="{ '--day': row.color }">{{ row.label }}</span>
          <span class="spend-name">{{ row.name }}</span>
          <span class="spend-items">
            <span v-for="(x, i) in row.items" :key="i" class="spend-item">
              <span class="spend-item-name">{{ x.item || '항목 없음' }}</span>
              <b class="mono">{{ formatMoney(x.amount, x.currency) }}</b>
            </span>
          </span>
        </li>
      </ul>
      <div class="spendsum">
        <span class="mono spendsum-label">합계</span>
        <b v-for="t in spendTotals" :key="t.currency" class="mono spendsum-amt">{{ formatMoney(t.amount, t.currency) }}</b>
      </div>
      <form method="dialog">
        <button type="submit" class="mono titledlg-close">닫기</button>
      </form>
    </dialog>

    <!-- 제목 전체. form method="dialog" 라 닫기에 스크립트가 필요 없다 -->
    <dialog ref="titleDlg" class="titledlg" aria-label="기록 제목">
      <p class="titledlg-text">{{ post.title }}</p>
      <form method="dialog">
        <button type="submit" class="mono titledlg-close">닫기</button>
      </form>
    </dialog>

    <PhotoLightbox
      v-if="activePoint && activeBadge"
      :photos="activePoint.photos"
      :point-name="activeBadge.name"
      :index="photoIndex"
      :prev-name="prevName"
      :next-name="nextName"
      @close="photoIndex = null"
      @move="photoIndex = $event"
      @step="stepPoint"
    />
  </main>
</template>

<style scoped>
/* 지도가 주인공인 화면이라 뷰포트에 고정한다.
   min-height 만 주면 레일 13행이 stage 를 밀어올려 지도가 화면 밖으로 넘친다. */
.page {
  /*
   * 이 화면은 문서가 스크롤되지 않는다(overflow: hidden). 그런데 헤더처럼 스크롤
   * 대상이 아닌 곳을 끌면 iOS 가 화면 전체를 고무줄로 끌어내려 상단에 빈 검은 띠가
   * 생긴다. overscroll-behavior 는 Safari 에서 「스크롤 오버플로가 없으면 무효」라
   * (WebKit #243452) 여기서는 브라우저 제스처 자체를 끈다.
   * 안쪽 스크롤 영역은 .scroll-y 가 touch-action: pan-y 로 다시 연다.
   */
  touch-action: none;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: var(--topbar-h);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 var(--topbar-x);
  border-bottom: 1px solid var(--hair);
  position: relative;
  z-index: 5;
  /*
   * standalone 은 레이아웃 뷰포트가 상태바 밑까지 올라간다. 상단바가 직접
   * 안전영역만큼 자라면서 자기 불투명 배경으로 그 구간을 덮어야 한다 —
   * 투명한 채로 두면 시스템이 그 위에 합성해 헤더가 흐려 보인다.
   * 이 선언들은 블록 끝에 있어야 위의 padding/background 단축 선언을 이긴다.
   * 브라우저에서는 인셋이 0 이라 원래 모습 그대로다.
   */
  padding-top: var(--top-inset);
  height: calc(var(--topbar-h) + var(--top-inset));
  background: var(--s0);
}
.left { display: flex; align-items: center; gap: var(--topbar-gap); min-width: 0; }
/* 통계와 편집 버튼은 한 덩어리다 — 사이가 벌어지면 통계가 「떠 있는 글자」로 보인다 */
.right { display: flex; align-items: center; gap: 16px; flex: none; }
/* h1 은 의미를 지키고, 자르기·누르기는 안쪽 버튼이 맡는다 —
   inline-block 인 버튼을 h1 이 직접 자르면 말줄임표 없이 잘리기만 한다 */
.title-h { display: flex; min-width: 0; }
.title {
  display: flex;
  min-width: 0;
  font-family: var(--font-display);
  font-size: var(--title-size);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
/* 자르기는 버튼이 아니라 여기서 한다 (위 마크업 주석 참고) */
.title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title:hover { color: var(--mid); }

/* 제목 전체 판 — 네이티브 <dialog> (top layer · ::backdrop · ESC 는 브라우저 몫) */
.titledlg {
  margin: auto;
  width: min(520px, calc(100vw - 32px));
  background: var(--s1);
  color: var(--ink);
  border: 1px solid rgb(var(--acc-rgb) / 0.28);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.titledlg::backdrop { background: rgb(var(--s0-rgb) / 0.7); backdrop-filter: blur(3px); }
.titledlg-text { font-size: var(--fs-2xl); line-height: 1.5; letter-spacing: -0.02em; text-wrap: pretty; overflow-wrap: anywhere; }
.titledlg-close {
  display: block;
  margin: 16px 0 0 auto;
  min-height: 40px;
  padding: 0 15px;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  font-size: var(--fs-sm);
  color: var(--mid);
  cursor: pointer;
}
/* wrap — 합계가 아래 줄을 통째로 쓴다. 두 줄이어도 11px×2 + 여백이라 56px 상단바 안이다 */
/* 편집으로 가는 문 — 목록 헤더의 「기록 관리」와 같은 모양이다 */
.edit-link {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 0 13px;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  font-size: var(--fs-sm);
  color: var(--mid);
}
.edit-link:hover { border-color: var(--focus-border); color: var(--ink); }
.edit-link.narrow-only { display: none; }

.stats { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 4px 16px; font-size: var(--fs-xs); color: var(--deep); flex: none; }
/* 데스크탑에는 통계가 상단바에 그대로 있으므로 토글이 필요 없다
   (base.css 가 display 를 :where() 에 두고 있어 이 한 줄이 그대로 이긴다) */
.stats-toggle { display: none; }
.stat { display: flex; align-items: center; gap: 6px; }
/* 눌러서 여는 칸이라 나머지 통계보다 한 톤 밝다 — 그것들은 글자고 이것만 조작이다 */
.spend { color: var(--mid); cursor: pointer; }
.spend:hover { color: var(--ink); }
.spend svg { color: var(--acc); }

.dlg-head { font-size: var(--fs-2xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--deep); }
.spendlist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  max-height: min(52vh, 420px);
}
.spendrow {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  gap: 4px 10px;
  align-items: center;
  padding: 9px 2px;
  border-bottom: 1px solid var(--hair-soft);
}
/* 레일·마커와 같은 번호·색이다 — 어느 포인트에서 쓴 돈인지 눈으로 잇는다 */
.spend-badge {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: var(--fs-micro);
  font-weight: 600;
  color: var(--day, var(--mid));
  border: 1px solid var(--day, rgb(var(--acc-rgb) / 0.55));
}
.spend-name { font-size: var(--fs-md); color: var(--mid); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spend-items { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
.spend-item { display: flex; align-items: baseline; gap: 8px; font-size: var(--fs-sm); color: var(--faint); }
.spend-item-name { color: var(--deep); }
.spend-item b { font-size: var(--fs-md); color: var(--ink); font-weight: 600; }

.spendsum {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--hair);
}
.spendsum-label { font-size: var(--fs-2xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.spendsum-amt { font-size: var(--fs-2xl); color: var(--ink); }
.stat svg { color: var(--faint); flex: none; }

.stage { flex: 1; position: relative; min-height: 0; display: grid; grid-template-columns: 1fr 348px; }

/* 자리표시 — 실제 화면과 같은 .stage / .rail 을 쓰므로 모바일 규칙이 그대로 적용된다.
   MapSkeleton 은 inset: 0 이라 .stage 가 아니라 «지도 칸»을 기준 삼게 한 겹 둔다. */
.mapslot { position: relative; min-width: 0; }
.sk-rail { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-left: 1px solid var(--hair); }
.sk-line-row { display: flex; align-items: center; gap: 12px; }
.sk-num { width: 30px; height: 30px; border-radius: 50%; flex: none; }
.sk-bar { flex: 1; height: 12px; border-radius: 4px; }
.sk-title { display: block; width: 190px; height: 20px; border-radius: 5px; }

.rail { position: relative; z-index: 3; min-height: 0; overflow: hidden; }

.detail {
  position: absolute;
  left: 0;
  right: 348px;
  bottom: 0;
  z-index: 4;
}

.sheet-enter-active, .sheet-leave-active { transition: transform 0.28s ease, opacity 0.2s ease; }
.sheet-enter-from, .sheet-leave-to { transform: translateY(16px); opacity: 0; }

/* 빈·에러 상태 */
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px;
  text-align: center;
}
.state-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: var(--topbar-h);
  border-radius: 16px;
  background: rgb(var(--acc-rgb) / 0.1);
  border: 1px solid var(--hair);
  color: var(--deep);
}
.state h3 { font-size: var(--fs-display); letter-spacing: -0.02em; color: var(--ink); }
.state p { max-width: 440px; font-size: var(--fs-lg); line-height: 1.7; color: var(--mid); opacity: 0.85; }
.state-stat { font-size: var(--fs-xs); color: var(--deep); }
.back-link {
  margin-top: 6px;
  padding: 9px 15px;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  font-size: var(--fs-xs);
  color: var(--mid);
}

/* 태블릿·모바일 — 세로 스택 */
@media (max-width: 900px) {
  /* 상단바는 타이틀 몫이다. 통계 4칸을 같이 두면 타이틀이 「2026.0…」 로 잘린다 —
     ⓘ 로 접어두고, 열면 상단바 «아래»에 겹쳐 펼친다.
     🔴 높이는 고정이다. 예전엔 통계가 상단바 안에서 한 줄 더 차지해서, ⓘ 를 누를 때마다
        헤더가 자라고 그만큼 지도·레일이 아래로 밀렸다 — 여닫을 때마다 화면이 출렁였다.
        상세 시트의 ⓘ 판과 같은 처리를 쓴다: 흐름에서 빼서(absolute) 덮는다. */
  .topbar { height: calc(var(--topbar-h-sm) + var(--top-inset)); min-height: 0; padding: var(--top-inset) var(--topbar-x-sm) 0; gap: 10px; flex-wrap: nowrap; }
  .title { font-size: var(--title-size-sm); }
  .left { flex: 1; min-width: 0; gap: 12px; }

  .stats-toggle {
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    margin-right: -8px;
    border: 0;
    background: none;
    color: var(--deep);
    cursor: pointer;
  }
  .stats-toggle[aria-expanded='true'] { color: var(--ink); }
  /* 상세 시트가 떠 있으면 시트의 ⓘ 가 정보를 맡는다 — ⓘ 가 둘로 보이면 안 된다 */
  .stats-toggle.hidden { display: none; }

  /* 상단바 아래에 겹쳐 뜬다 — 흐름 밖이라 여닫아도 지도·레일이 움직이지 않는다.
     지도 위를 덮으므로 배경은 반드시 불투명해야 한다. */
  .stats {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 6;
    flex-wrap: wrap;
    /* 데스크탑 상단바에서는 오른쪽으로 몰지만, 여기서는 판이 화면 폭을 다 쓰므로 왼쪽부터 읽는다 */
    justify-content: flex-start;
    gap: 8px 14px;
    padding: 10px 14px;
    background: var(--s0);
    border-bottom: 1px solid var(--hair);
    font-size: var(--fs-2xs);
  }
  .stats.open { display: flex; }
  /* 넓은 화면 몫은 감추고, 판 안의 것만 남긴다 */
  .edit-link.wide-only { display: none; }
  .edit-link.narrow-only { display: flex; flex-basis: 100%; justify-content: center; min-height: 40px; margin-top: 2px; }
  .stat svg { display: none; }

  .stage { grid-template-columns: 1fr; grid-template-rows: 46dvh 1fr; }
  .rail { min-height: 0; }
  .detail { left: 0; right: 0; top: 0; height: auto; border-radius: 0; }
}

@media (max-width: 900px) and (min-width: 601px) {
  .stage { grid-template-rows: 52dvh 1fr; }
}
</style>
