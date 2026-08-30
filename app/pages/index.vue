<script setup lang="ts">
import { vSk } from '~/utils/img'
import { vTip } from '~/utils/tip'
import BrandMark from '~/components/BrandMark.vue'
import MapSkeleton from '~/components/MapSkeleton.vue'
import SiteFooter from '~/components/SiteFooter.vue'
/** 포스트 목록 — 아트보드 1a. 공개 경로라 절대 잠기지 않는다. */
import type { PostSummary } from '#shared/types/db'
import { formatKm, formatRange } from '#shared/utils/format'

const { data: posts, status } = useFetch<PostSummary[]>('/api/posts', { default: () => [], lazy: true })
const { loggedIn } = useUserSession()

/**
 * 로고 3연타로 편집 화면에 들어간다.
 *
 * 「기록 관리」 링크는 loggedIn 일 때만 보이는데, 로그인하려면 /editor 로 가야 한다.
 * 브라우저에서는 주소를 치면 되지만 홈 화면에 추가한 standalone 에는 주소 표시줄이
 * 없어서 길이 아예 없다 — 실제로 그래서 못 들어가셨다.
 *
 * 링크를 항상 노출하지 않는 이유는, 여기가 아무나 보는 공개 목록이라 편집 입구를
 * 광고할 필요가 없어서다. 보안 장치는 아니다(비밀번호가 그 역할을 한다) —
 * 그냥 눈에 안 띄는 문이다.
 */
const SECRET_TAPS = 3
const TAP_WINDOW_MS = 1200
const taps = ref(0)
let tapTimer: ReturnType<typeof setTimeout> | null = null

function tapBrand() {
  taps.value += 1
  if (tapTimer) clearTimeout(tapTimer)

  if (taps.value >= SECRET_TAPS) {
    taps.value = 0
    navigateTo('/editor')
    return
  }
  // 창 안에 다음 탭이 안 오면 처음부터. 세다가 놓쳐도 그냥 다시 누르면 된다.
  tapTimer = setTimeout(() => { taps.value = 0 }, TAP_WINDOW_MS)
}

onBeforeUnmount(() => { if (tapTimer) clearTimeout(tapTimer) })

/**
 * 최신순 고정이다. 「기간 / 포인트 수」로 바꾸는 세그먼티드 컨트롤이 있었는데 걷어냈다 —
 * 여행 기록은 최근 것부터 보는 게 기본이고, 실제로 다른 순서를 고른 적이 없다.
 * 고정 폭 문자열(YYYY-MM-DD…)이라 사전순 비교가 곧 시각 순이다.
 */
const sorted = computed(() =>
  [...posts.value].sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')),
)

const totals = computed(() => ({
  posts: posts.value.length,
  points: posts.value.reduce((n, p) => n + p.point_count, 0),
  photos: posts.value.reduce((n, p) => n + p.photo_count, 0),
}))

useHead({ title: 'pic·blog — 사진 좌표 기반 여행 로그' })
</script>

<template>
  <main class="page">
    <header class="topbar">
      <div class="brand">
        <!-- 3연타로 편집 화면 (위 tapBrand 주석 참고). 두 번째 탭부터 마크가
             살짝 반응해서, 세다가 놓쳤는지 알 수 있게 한다. -->
        <button
          type="button"
          class="markbtn brandbox"
          :class="{ armed: taps > 0 }"
          aria-label="pic·blog"
          @click="tapBrand"
        >
          <BrandMark class="mark" />
        </button>
        <span class="wordmark">pic<span class="dot">·</span>blog</span>
        <span class="mono kicker">travel log</span>
      </div>
      <div class="right">
        <span v-if="posts.length" class="mono totals">
          {{ totals.posts }} 기록 · {{ totals.points }} 포인트 · {{ totals.photos }}장
        </span>
        <!-- 아이콘을 단다 — 「기록 관리」의 반대편 짝인 편집 화면의 「뷰어 이동」이
             눈 아이콘을 달고 있다. 오가는 두 문이 같은 모양이라야 짝으로 읽힌다. -->
        <NuxtLink v-if="loggedIn" to="/editor" class="mono editor-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>
          기록 관리
        </NuxtLink>
      </div>
    </header>


    <!--
      불러오는 중 — 오는 것의 «모양»을 그대로 잡아둔다.
      default: () => [] 라 pending 중에도 posts 는 빈 배열이다. 이 갈래가 먼저 와야
      「아직 기록이 없습니다」가 잠깐 스쳤다 사라지는 일이 없다.
    -->
    <template v-if="status === 'pending'">
      <div class="map-strip">
        <MapSkeleton />
      </div>
      <div class="grid" role="status" aria-label="기록을 불러오는 중">
        <div v-for="i in 2" :key="i" class="card sk-card" aria-hidden="true">
          <div class="sk sk-cover" />
          <div class="body">
            <span class="sk line lg" />
            <span class="sk line" />
          </div>
          <div class="foot">
            <span class="sk line sm" />
            <span class="sk line sm" />
          </div>
        </div>
      </div>
    </template>

    <!-- 아트보드 1c ① 기록 0 -->
    <section v-else-if="!posts.length" class="empty">
      <span class="empty-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
      </span>
      <h3>아직 기록이 없습니다</h3>
      <p>사진을 올리면 EXIF 의 GPS 좌표로 포인트가 만들어지고, 촬영 시각 순으로 동선이 이어집니다.</p>
      <NuxtLink to="/editor/new" class="mono cta">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
        첫 기록 만들기
      </NuxtLink>
    </section>

    <template v-else>
      <div class="map-strip">
        <PostsMap :posts="posts" />
      </div>

      <div class="grid">
        <NuxtLink v-for="post in sorted" :key="post.slug" :to="`/p/${post.slug}`" class="card">
          <div class="cover">
            <img v-if="post.cover_thumb" v-sk class="sk" :src="post.cover_thumb" alt="" loading="lazy" decoding="async">
            <span v-else class="mono cover-empty">커버 사진 없음</span>
            <span v-if="!post.is_public" class="private mono">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></svg>
              비공개
            </span>
          </div>
          <div class="body">
            <h3 v-tip class="title">{{ post.title }}</h3>
            <p v-if="post.summary" class="summary">{{ post.summary }}</p>
          </div>
          <div class="foot">
            <span class="range">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" /><path d="M16 3l0 4" /><path d="M8 3l0 4" /><path d="M4 11l16 0" /></svg>
              <span class="mono">{{ formatRange(post.started_at, post.ended_at) }}</span>
            </span>
            <span class="mono stat">{{ post.point_count }} 포인트</span>
            <!-- 좁은 화면에서는 접는다 — 한 줄에 다 넣으면 행이 접혀 높이가 들쭉날쭉해진다 -->
            <span class="mono stat extra">· {{ post.photo_count }}장 · {{ formatKm(post.distance_km) }} km</span>
          </div>
        </NuxtLink>
      </div>

      <SiteFooter />
    </template>
  </main>
</template>

<style scoped>
.page { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

.topbar {
  height: var(--topbar-h);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 var(--topbar-x);
  border-bottom: 1px solid var(--hair);
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
.brand { display: flex; align-items: center; gap: 12px; }
.markbtn {
  /* 크기·자리는 base.css 의 .brandbox 가 정한다 (기록 관리 헤더와 같은 값) */
  border: 0;
  background: none;
  cursor: pointer;
}
.mark { flex: none; color: var(--ink); transition: color 0.15s, transform 0.15s; }
/* 세는 중이라는 최소한의 신호. 문을 광고하지는 않는다. */
.markbtn.armed .mark { color: var(--route); transform: scale(1.06); }
.wordmark {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.wordmark .dot { color: var(--deep); }
.kicker { font-size: var(--fs-2xs); letter-spacing: 0.16em; text-transform: uppercase; color: var(--deep); }

.right { display: flex; align-items: center; gap: 22px; }
.totals { font-size: var(--fs-xs); color: var(--deep); }
.editor-link {
  /* 헤더 버튼은 높이가 36px 로 고정된다(base.css). 글자가 11px 이면 상자 안이
     텅 비어 「빈 테두리」처럼 보인다 — 글자를 상자에 맞춘다. */
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-sm);
  color: var(--mid);
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  padding: 0 13px;
}

.map-strip { position: relative; height: 236px; flex: none; border-bottom: 1px solid var(--hair); }

/* 이 화면에서 굴러가는 유일한 칸 (레이아웃 셸 주석 참고) */
.grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  /* 🔴 auto 행은 「최소 크기」까지 눌린다. 카드가 overflow: hidden 이라 최소 크기가
     0 이고, 높이가 확정된 격자 안에서 카드가 찌부러져 커버가 잘렸다.
     행은 내용 높이 그대로 두고, 넘치는 만큼 격자가 스크롤한다. */
  grid-auto-rows: max-content;
  gap: 24px;
  padding: 26px 32px;
  align-content: start;
}
.grid::-webkit-scrollbar { width: 0; }

.card {
  display: flex;
  flex-direction: column;
  background: var(--s2);
  border: 1px solid rgb(var(--mid-rgb) / 0.13);
  border-radius: var(--radius);
  overflow: hidden;
  color: inherit;
  transition: border-color 0.14s, transform 0.14s;
}
.card:hover { border-color: rgb(var(--acc-rgb) / 0.45); transform: translateY(-2px); }

.cover {
  height: 196px;
  flex: none;
  position: relative;
  background: repeating-linear-gradient(135deg, #26262C 0 9px, #1E1E24 9px 18px);
}
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-empty {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--fs-2xs);
  letter-spacing: 0.08em;
  color: var(--faint);
}
.private {
  position: absolute;
  right: 12px;
  top: 12px;
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgb(var(--s0-rgb) / 0.82);
  border: 1px solid rgb(var(--mid-rgb) / 0.18);
  padding: 3px 7px;
  font-size: var(--fs-micro);
  letter-spacing: 0.08em;
  color: var(--mid);
}

.body { padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 7px; }

/*
 * 자리표시 카드 — 실제 카드(.card)의 상자를 그대로 쓰고 내용만 띠로 바꾼다.
 * 커버는 .cover 를 재사용하지 않는다. .cover 의 `background:` 단축 선언이
 * .sk 의 배경색·훑기 그라디언트를 통째로 덮어 투명해진다 — 실제로 안 보였다.
 */
.sk-card { pointer-events: none; }
.sk-cover { height: 196px; border-radius: 0; }
.line { display: block; height: 11px; border-radius: 4px; }
.line.lg { height: 20px; width: 64%; }
.line.sm { height: 9px; width: 32%; }
.title {
  font-size: var(--fs-display);
  letter-spacing: -0.02em;
  line-height: 1.18;
  color: var(--ink);
  /* 한 줄로 자른다 — 두 줄 세 줄로 늘어나면 카드마다 높이가 달라져 격자가 어긋난다.
     잘린 전체는 v-tip 이 보여준다 (마우스오버 / 꾹 누르기). */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.summary { font-size: var(--fs-lg); line-height: 1.6; color: var(--mid); opacity: 0.82; text-wrap: pretty; }

.foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 18px;
  border-top: 1px solid rgb(var(--mid-rgb) / 0.1);
}
.range { display: flex; align-items: center; gap: 6px; color: var(--faint); }
.range .mono, .stat { font-size: var(--fs-2xs); color: var(--deep); }
.stat.extra { margin-left: 4px; }


/* 1c ① 기록 0 */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px;
  text-align: center;
  /* 셸이 overflow: hidden 이라 문서 스크롤이 없다 — 짧은 화면(가로 모드 등)에서
     내용이 넘치면 여기서 굴러야 잘리지 않는다 */
  overflow-y: auto;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: rgb(var(--acc-rgb) / 0.1);
  border: 1px solid var(--hair);
  color: var(--deep);
}
.empty h3 { font-size: var(--fs-display); letter-spacing: -0.02em; color: var(--ink); }
.empty p { max-width: 460px; font-size: var(--fs-lg); line-height: 1.7; color: var(--mid); opacity: 0.85; }
.cta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
  /* base.css 의 .btn.primary 와 같은 처방 — tokens.css 의 --primary-fill 주석 참고 */
  background: var(--primary-fill);
  color: var(--ink);
  border-radius: var(--radius);
  padding: 11px 18px;
  font-size: var(--fs-sm);
}
.cta:hover { filter: brightness(1.2); }

@media (max-width: 1100px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  /* 🔴 flex: none 이 있어야 한다. 세로 flex 아이템의 높이는 flex 알고리즘이 정하므로
     flex-grow 가 살아 있으면 height: 100dvh 가 그냥 무시된다 (.shell 이 min-height 라
     내용만큼 자란다) — 실제로 문서가 1676px 이었다. */
  .page { flex: none; height: 100dvh; min-height: 0; overflow: hidden; touch-action: none; }
  .grid {
    min-height: 0;
    /* 🔴 auto 행은 「최소 크기」까지 눌린다. 카드가 overflow: hidden 이라 최소 크기가
       0 이고, 높이가 확정된 격자 안에서 카드가 94px 로 찌부러져 커버가 잘렸다.
       행은 내용 높이 그대로 두고, 넘치는 만큼 격자가 스크롤한다. */
    grid-auto-rows: max-content;
    overflow-y: auto;
    touch-action: pan-y;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }
  .grid::-webkit-scrollbar { width: 0; }

  .topbar { height: calc(var(--topbar-h-sm) + var(--top-inset)); padding: var(--top-inset) var(--topbar-x-sm) 0; gap: 10px; }
  /* 모바일은 마크만 — 워드마크까지 두면 우측 액션과 다툰다 */
  .wordmark { display: none; }
  .kicker { display: none; }
  /* 지도가 이 화면의 주인공이다. 카드가 커서 지도가 눌려 보인다는 지적을 받아 띠를 키웠다 */
  .map-strip { height: 246px; }

  /*
   * 카드를 「기록 관리 목록」과 같은 행으로 접는다.
   * 커버를 크게 깔면 한 화면에 한 기록 반쯤만 들어가고, 그만큼 지도가 밀린다.
   * 훑어보는 목록에서 세로는 비싸다 — 썸네일 · 제목 한 줄 · 메타 한 줄이면 충분하다.
   */
  .grid { grid-template-columns: 1fr; gap: 10px; padding: 12px 12px 16px; }
  .card {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 2px;
    padding: 12px;
    align-items: center;
  }
  .card:hover { transform: none; }
  .cover { grid-row: 1 / 3; width: 64px; height: 48px; border-radius: 6px; overflow: hidden; }
  /* 64px 칸에 상자를 두르면 커버가 안 보인다 — 글자만 남긴다 */
  .private { right: 2px; top: 2px; gap: 0; padding: 1px 3px; font-size: var(--fs-micro); letter-spacing: 0; }
  .private svg { display: none; }
  .cover-empty { font-size: var(--fs-micro); }

  .body { grid-column: 2; padding: 0; gap: 0; min-width: 0; }
  .title { font-size: var(--fs-xl); line-height: 1.3; }
  .summary { display: none; }

  .foot {
    grid-column: 2;
    margin-top: 0;
    padding: 0;
    border-top: 0;
    justify-content: flex-start;
    gap: 5px;
    min-width: 0;
  }
  .range .mono, .stat { font-size: var(--fs-2xs); }
  .range svg { display: none; }
  .stat.extra { display: none; }

  /* 자리표시는 실제 행과 같은 상자를 쓴다 — 도착했을 때 레이아웃이 튀지 않게 */
  .sk-cover { width: 64px; height: 48px; border-radius: 6px; }
  .line.lg { height: 15px; }
}
</style>
