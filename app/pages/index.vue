<script setup lang="ts">
import { vSk } from '~/utils/img'
import { vTip } from '~/utils/tip'
import BrandMark from '~/components/BrandMark.vue'
import MapSkeleton from '~/components/MapSkeleton.vue'
import SiteFooter from '~/components/SiteFooter.vue'
/** 포스트 목록 — 아트보드 1a. 공개 경로라 절대 잠기지 않는다. */
import type { PostSummary } from '#shared/types/db'
import { formatKm, formatRange } from '#shared/utils/format'

type Sort = 'recent' | 'range' | 'points'

const { data: posts, status } = useFetch<PostSummary[]>('/api/posts', { default: () => [], lazy: true })
const { loggedIn } = useUserSession()

const sort = ref<Sort>('recent')

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

const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: '최신' },
  { key: 'range', label: '기간' },
  { key: 'points', label: '포인트 수' },
]

const sorted = computed(() => {
  const list = [...posts.value]
  if (sort.value === 'points') return list.sort((a, b) => b.point_count - a.point_count)
  if (sort.value === 'range') {
    const span = (p: PostSummary) =>
      p.started_at && p.ended_at ? Date.parse(p.ended_at) - Date.parse(p.started_at) : 0
    return list.sort((a, b) => span(b) - span(a))
  }
  return list.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
})

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
          class="markbtn"
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
        <nav v-if="posts.length" class="sorts" aria-label="정렬">
          <button
            v-for="s in SORTS"
            :key="s.key"
            type="button"
            class="mono sort"
            :class="{ on: sort === s.key }"
            @click="sort = s.key"
          >
            {{ s.label }}
          </button>
        </nav>
        <span v-if="posts.length" class="mono totals">
          {{ totals.posts }} 기록 · {{ totals.points }} 포인트 · {{ totals.photos }}장
        </span>
        <NuxtLink v-if="loggedIn" to="/editor" class="mono editor-link">기록 관리</NuxtLink>
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
            <span class="mono stat">
              {{ post.point_count }} 포인트 · {{ post.photo_count }}장 · {{ formatKm(post.distance_km) }} km
            </span>
          </div>
        </NuxtLink>
      </div>

      <SiteFooter />
    </template>
  </main>
</template>

<style scoped>
.page { flex: 1; display: flex; flex-direction: column; min-height: 100dvh; }

.topbar {
  height: 68px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 32px;
  border-bottom: 1px solid var(--hair);
  /*
   * standalone 은 레이아웃 뷰포트가 상태바 밑까지 올라간다. 상단바가 직접
   * 안전영역만큼 자라면서 자기 불투명 배경으로 그 구간을 덮어야 한다 —
   * 투명한 채로 두면 시스템이 그 위에 합성해 헤더가 흐려 보인다.
   * 이 선언들은 블록 끝에 있어야 위의 padding/background 단축 선언을 이긴다.
   * 브라우저에서는 인셋이 0 이라 원래 모습 그대로다.
   */
  padding-top: var(--top-inset);
  height: calc(68px + var(--top-inset));
  background: var(--s0);
}
.brand { display: flex; align-items: center; gap: 12px; }
.markbtn {
  display: grid;
  place-items: center;
  flex: none;
  /* 터치 타깃 — 3연타를 하려면 넉넉해야 한다 */
  width: 36px;
  height: 36px;
  margin-left: -6px;
  border: 0;
  background: none;
  cursor: pointer;
}
.mark { flex: none; color: var(--ink); transition: color 0.15s, transform 0.15s; }
/* 세는 중이라는 최소한의 신호. 문을 광고하지는 않는다. */
.markbtn.armed .mark { color: var(--route); transform: scale(1.06); }
.wordmark {
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.wordmark .dot { color: var(--deep); }
.kicker { font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--deep); }

.right { display: flex; align-items: center; gap: 22px; }
/*
 * 세그먼티드 컨트롤 — 「텍스트만 있는 버튼 금지」는 묶음 단위로 지킨다.
 * 낱개에 테두리를 두르면 세 개의 독립 버튼처럼 읽혀 「하나만 고른다」가 안 보인다.
 * 대신 트랙이 테두리·배경을 갖고, 고른 칸만 안에서 채워진다.
 */
.sorts {
  display: flex;
  gap: 2px;
  border-radius: var(--radius);
  background: rgba(146, 178, 169, 0.06);
  /* 테두리 대신 inset 그림자 — border 를 쓰면 트랙이 2px 자라 옆의 36px 컨트롤과 어긋난다 */
  box-shadow: inset 0 0 0 1px rgba(177, 199, 193, 0.2);
}
.sort {
  font-size: 11px;
  color: var(--deep);
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
}
.sort:hover { color: var(--mid); }
.sort.on { background: var(--mid); color: var(--s0); }
.totals { font-size: 11px; color: var(--deep); }
.editor-link {
  /* 헤더 버튼은 높이가 36px 로 고정된다(base.css). 글자가 11px 이면 상자 안이
     텅 비어 「빈 테두리」처럼 보인다 — 글자를 상자에 맞춘다. */
  display: flex;
  align-items: center;
  font-size: 12.5px;
  color: var(--mid);
  border: 1px solid rgba(177, 199, 193, 0.2);
  border-radius: var(--radius);
  padding: 0 13px;
}

.map-strip { position: relative; height: 236px; flex: none; border-bottom: 1px solid var(--hair); }

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 26px 32px 0;
  align-content: start;
}

.card {
  display: flex;
  flex-direction: column;
  background: var(--s2);
  border: 1px solid rgba(177, 199, 193, 0.13);
  border-radius: var(--radius);
  overflow: hidden;
  color: inherit;
  transition: border-color 0.14s, transform 0.14s;
}
.card:hover { border-color: rgba(146, 178, 169, 0.45); transform: translateY(-2px); }

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
  font-size: 10.5px;
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
  background: rgba(4, 4, 8, 0.82);
  border: 1px solid rgba(177, 199, 193, 0.18);
  padding: 3px 7px;
  font-size: 9.5px;
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
  font-size: 24px;
  letter-spacing: -0.02em;
  line-height: 1.18;
  color: var(--ink);
  /* 한 줄로 자른다 — 두 줄 세 줄로 늘어나면 카드마다 높이가 달라져 격자가 어긋난다.
     잘린 전체는 v-tip 이 보여준다 (마우스오버 / 꾹 누르기). */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.summary { font-size: 14px; line-height: 1.6; color: var(--mid); opacity: 0.82; text-wrap: pretty; }

.foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 18px;
  border-top: 1px solid rgba(177, 199, 193, 0.1);
}
.range { display: flex; align-items: center; gap: 6px; color: var(--faint); }
.range .mono, .stat { font-size: 10.5px; color: var(--deep); }


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
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: rgba(146, 178, 169, 0.1);
  border: 1px solid var(--hair);
  color: var(--deep);
}
.empty h3 { font-size: 24px; letter-spacing: -0.02em; color: var(--ink); }
.empty p { max-width: 460px; font-size: 14px; line-height: 1.7; color: var(--mid); opacity: 0.85; }
.cta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
  background: var(--mid);
  color: var(--s0);
  border-radius: var(--radius);
  padding: 11px 18px;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  /*
   * 스크롤은 목록에만 둔다. 문서가 통째로 스크롤되면 상단 지도 스트립까지 같이 밀려
   * 올라가 「지도가 있는 화면」이 아니라 「긴 문서」가 된다 — 상세 화면(p/[slug])과
   * 같은 구조로 맞춘다: 페이지는 뷰포트에 고정, 안쪽 목록만 굴린다.
   *
   * touch-action: none 은 iOS 의 고무줄 당김을 막는다. 헤더처럼 스크롤 대상이 아닌
   * 곳을 끌면 화면 전체가 딸려 내려와 상단에 검은 띠가 생긴다 (overscroll-behavior 는
   * 「스크롤 오버플로가 없으면 무효」라 Safari 에서 듣지 않는다 — WebKit #243452).
   * 목록은 아래에서 pan-y 로 다시 연다.
   */
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

  .topbar { height: calc(54px + var(--top-inset)); padding: var(--top-inset) 16px 0; gap: 10px; }
  /* 모바일은 마크만 — 워드마크까지 두면 우측 액션과 다툰다 */
  .wordmark { display: none; }
  .kicker, .sorts { display: none; }
  .map-strip { height: 166px; }
  .grid { grid-template-columns: 1fr; gap: 16px; padding: 16px 16px 16px; }
  .cover { height: 150px; }
  .body { padding: 13px 14px 11px; gap: 5px; }
  .title { font-size: 20px; }
  .summary { font-size: 13px; }
  .foot { padding: 10px 14px; }
}
</style>
