<script setup lang="ts">
import { vSk } from '~/utils/img'
import { vTip } from '~/utils/tip'
/**
 * 기록 관리 목록 — 편집 진입점.
 * 목록 자체는 아트보드 1a 와 같은 시각 언어다. 행은 상세로 가고, 우측 연필이 편집으로 간다.
 * 공개 여부는 여기서 바꾸지 않는다 — 편집 1단계(PostSettings)가 갖고 있다.
 */
import type { PostSummary } from '#shared/types/db'
import { formatRange } from '#shared/utils/format'

definePageMeta({ layout: 'editor' })

const { data: posts, status } = useFetch<PostSummary[]>('/api/posts', { default: () => [], lazy: true })
useHead({ title: '기록 관리 — pic·blog' })
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <!-- 마크가 홈 링크를 겸한다. PWA standalone 에는 브라우저 뒤로가기가 없어서
             화면마다 상위로 가는 경로가 하나씩은 있어야 한다. -->
        <NuxtLink to="/" class="home" aria-label="pic·blog 홈">
          <span class="brandbox"><BrandMark class="mark" /></span>
          <span class="wordmark">pic<span class="dot">·</span>blog</span>
        </NuxtLink>
        <span class="mono kicker">기록 관리</span>
      </div>

      <div class="top-actions">
        <NuxtLink to="/editor/new" class="btn primary mono">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
          새 기록
        </NuxtLink>
        <NuxtLink to="/" class="btn ghost mono">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></svg>
          뷰어 이동
        </NuxtLink>
      </div>
    </header>

    <!-- 불러오는 중 — 행의 «모양»을 잡아둔다. pending 에도 posts 는 [] 라 이 갈래가 먼저다. -->
    <ul v-if="status === 'pending'" class="list safe-bottom" role="status" aria-label="기록을 불러오는 중">
      <li v-for="i in 3" :key="i" class="row sk-row" aria-hidden="true">
        <span class="sk sk-cover" />
        <div class="main">
          <span class="sk line lg" />
          <span class="sk line" />
          <span class="sk line sm" />
        </div>
      </li>
    </ul>

    <!-- 아트보드 1c ① 기록 0 -->
    <section v-else-if="!posts.length" class="empty">
      <span class="empty-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
      </span>
      <h3>아직 기록이 없습니다</h3>
      <p>사진을 올리면 EXIF 의 GPS 좌표로 포인트가 만들어지고, 촬영 시각 순으로 동선이 이어집니다.</p>
      <NuxtLink to="/editor/new" class="btn primary mono big">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
        첫 기록 만들기
      </NuxtLink>
    </section>

    <ul v-else class="list safe-bottom">
      <li v-for="post in posts" :key="post.slug" class="row">
        <span class="cover">
          <img v-if="post.cover_thumb" v-sk class="sk" :src="post.cover_thumb" alt="" loading="lazy" decoding="async">
          <span v-else class="mono cover-empty">커버 없음</span>
        </span>

        <div class="main">
          <h3 v-tip class="title">
            <!--
              행 전체가 «편집»으로 가는 링크다. 여기는 기록 «관리» 화면이라 행을 누르는
              기본 행동이 편집이어야 한다 — 보기는 우측 아이콘이 맡는다.
              ::after 로 행을 덮되 제목이 링크의 이름이 되어 스크린리더가 「무엇으로 가는
              링크인지」 읽을 수 있다. 보기 아이콘은 그 위에 떠 있다 (.view 의 z-index).
            -->
            <NuxtLink :to="`/editor/${post.slug}`" class="stretch">{{ post.title }}</NuxtLink>
          </h3>
          <p v-if="post.summary" class="summary">{{ post.summary }}</p>
          <!-- 날짜 + 포인트 수만. 장수·km 까지 넣으면 좁은 화면에서 이 줄이 두 줄로 접혀
               행 높이가 들쭉날쭉해진다 — 세부 수치는 상세·편집 화면이 말한다. -->
          <p class="mono meta">
            <span v-if="!post.is_public" class="private">비공개</span>
            {{ post.started_at ? formatRange(post.started_at, post.ended_at) : '기간 없음' }}
            · {{ post.point_count }} 포인트
          </p>
        </div>


        <NuxtLink :to="`/p/${post.slug}`" class="view" :aria-label="`${post.title} 보기`">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></svg>
        </NuxtLink>
      </li>
    </ul>
  </div>
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
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.home { display: flex; align-items: center; gap: 12px; color: var(--ink); }
.mark { flex: none; }
.wordmark {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.wordmark .dot { color: var(--deep); }
.kicker { font-size: var(--fs-2xs); letter-spacing: 0.16em; color: var(--deep); }

.top-actions { display: flex; align-items: center; gap: 9px; flex: none; }


/* 이 화면에서 굴러가는 유일한 칸 (레이아웃 셸 주석 참고) */
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 22px 32px;
  list-style: none;
  align-content: start;
}
.list::-webkit-scrollbar { width: 0; }

.row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 14px 18px;
  background: var(--s2);
  border: 1px solid rgb(var(--mid-rgb) / 0.13);
  border-radius: var(--radius);
  transition: border-color 0.14s;
}
.row { position: relative; cursor: pointer; }

/*
 * 자리표시 행 — 실제 행(.row)의 격자를 그대로 쓰고 내용만 띠로 바꾼다.
 * 커버는 .cover 를 재사용하지 않는다. .cover 의 `background:` 단축 선언이
 * .sk 의 배경을 통째로 덮어 투명해진다.
 */
.sk-row { pointer-events: none; }
.sk-cover { display: block; width: 88px; height: 62px; border-radius: 6px; }
.sk-row .main { display: flex; flex-direction: column; gap: 8px; }
.line { display: block; height: 11px; border-radius: 4px; }
.line.lg { height: 17px; width: 46%; }
.line.sm { height: 9px; width: 62%; }
.row:hover { border-color: rgb(var(--acc-rgb) / 0.45); }

.cover {
  position: relative;
  display: block;
  width: 88px;
  height: 62px;
  flex: none;
  border-radius: 6px;
  overflow: hidden;
  background: repeating-linear-gradient(135deg, #26262C 0 9px, #1E1E24 9px 18px);
}
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-empty {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--fs-micro);
  letter-spacing: 0.06em;
  color: var(--faint);
  white-space: nowrap;
}

.main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.title {
  font-size: var(--fs-2xl);
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary {
  font-size: var(--fs-md);
  line-height: 1.5;
  color: var(--mid);
  opacity: 0.82;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta { font-size: var(--fs-2xs); color: var(--deep); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 공개 토글은 편집 1단계로 갔다. 목록에는 상태만 남긴다 — 컨트롤이 아니라 표시다. */
.private {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 5px;
  border: 1px solid rgb(var(--mid-rgb) / 0.28);
  border-radius: 4px;
  color: var(--mid);
}

/* 행 전체를 덮는 투명 링크. 위에 떠야 하는 것(.view)만 z-index 로 빠져나온다. */
.stretch { color: inherit; }
.stretch::after { content: ''; position: absolute; inset: 0; z-index: 1; }

/* 우측 끝 보기 — 아이콘 전용이라 상자를 두르지 않는다 */
.view {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: var(--radius);
  color: var(--deep);
}
.view:hover { color: var(--ink); background: rgb(var(--acc-rgb) / 0.12); }
.view:active { background: rgb(var(--acc-rgb) / 0.18); }

/* 아트보드 1c ① 기록 0 */
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
  height: var(--topbar-h);
  border-radius: 16px;
  background: rgb(var(--acc-rgb) / 0.1);
  border: 1px solid var(--hair);
  color: var(--deep);
}
.empty h3 { font-size: var(--fs-display); letter-spacing: -0.02em; color: var(--ink); }
.empty p { max-width: 460px; font-size: var(--fs-lg); line-height: 1.7; color: var(--mid); opacity: 0.85; }

@media (max-width: 900px) {
  .topbar { height: calc(var(--topbar-h-sm) + var(--top-inset)); padding: var(--top-inset) var(--topbar-x-sm) 0; gap: 10px; }
  /* 모바일 헤더 = [뒤로] [화면 이름] [주 액션]. 브랜드는 통째로 접는다 —
     어느 화면인지가 브랜드보다 중요하고, 홈은 뒤로가기가 가리킨다.
     .home 까지 숨기는 이유: 안이 비면 0x0 으로 찌부러져 보이지도 눌리지도 않는
     죽은 링크가 남는다. 실제로 그랬다. */
  .home, .wordmark, .mark { display: none; }
  .kicker {
    font-family: var(--font-display);
    font-size: var(--title-size);
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .list { gap: 10px; padding: 16px; }

  /* 커버 | 본문 | 연필 세 칸을 한 줄에 — 64+44+간격 을 빼고 남는 폭이 제목 몫이다 */
  /* 세 칸을 세로 가운데로. start 는 제목이 두 줄까지 흐르던 시절의 값이라, 한 줄로
     고정된 지금은 행 높이를 정하는 연필 버튼(44px) 때문에 아래만 벌어진다. */
  .row { grid-template-columns: 64px minmax(0, 1fr) auto; gap: 10px; padding: 12px; align-items: center; }
  /*
   * 한 줄로 자른다. 예전엔 두 줄까지 흘려보냈는데 — 제목 칸이 186px 뿐이라 잘리면
   * 「2026.04.14 – 04.15 …」 가 된다는 이유였다 — 제목이 긴 행만 81px 로 자라
   * 목록이 들쭉날쭉해졌다. 이제 잘린 전체를 v-tip 이 보여주므로(꾹 누르기)
   * 그 이유가 사라졌다. 행 높이가 고른 쪽이 목록으로서 더 낫다.
   */
  .title { font-size: var(--fs-xl); }
  .summary { display: none; }
  .meta { font-size: var(--fs-2xs); line-height: 1.5; }
  .view { align-self: center; width: 44px; height: 44px; }
  /*
   * 커버 높이 = 연필 버튼 높이(44px). 행 높이는 어차피 그 터치 타깃이 정하므로
   * 여기에 맞추면 위아래 여백이 같아진다 — 48px 이던 예전 값은 7px 길어서
   * 아래만 벌어져 보였다.
   * 🔴 height: auto 로 두면 안 된다. 세로 사진(267×400)이 64px 폭에서 96px 로 자라
   *    행이 122px 이 된다 — object-fit: cover 가 잘라주려면 높이가 «정해져» 있어야 한다.
   */
  .cover { width: 64px; height: 44px; }
}
</style>
