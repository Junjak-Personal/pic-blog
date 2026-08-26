<script setup lang="ts">
import AppBack from '~/components/AppBack.vue'
/**
 * 기록 관리 목록 — 편집 진입점.
 * 목록 자체는 아트보드 1a 와 같은 시각 언어지만, 여기서만 공개 여부를 뒤집을 수 있다 (설계문서 §7.2).
 */
import type { PostSummary } from '#shared/types/db'
import { formatKm, formatRange } from '#shared/utils/format'

definePageMeta({ layout: 'editor' })

const { data: posts } = await useFetch<PostSummary[]>('/api/posts', { default: () => [] })
const { fetch: refreshSession } = useUserSession()

const error = ref<string | null>(null)
/** 요청 중인 slug — 응답 전에 다시 눌러 되돌리기 대상이 어긋나는 것을 막는다 */
const pending = ref(new Set<string>())

useHead({ title: '기록 관리 — pic·blog' })

/** 낙관적으로 먼저 뒤집고, 실패하면 되돌린 뒤 문구를 띄운다 (조용한 실패 금지 — 설계문서 §8) */
async function togglePublic(post: PostSummary) {
  if (pending.value.has(post.slug)) return
  const next = !post.is_public
  post.is_public = next
  pending.value.add(post.slug)
  error.value = null
  try {
    await $fetch(`/api/posts/${post.slug}`, { method: 'PATCH', body: { is_public: next } })
  } catch (e) {
    post.is_public = !next
    error.value = `${post.title} — ${reasonOf(e)}`
  } finally {
    pending.value.delete(post.slug)
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await refreshSession()
}

/**
 * 실패 사유는 응답 본문(`data.statusMessage`)에서 읽는다 — FetchError 의 `statusMessage` 는
 * HTTP status line 의 reason phrase 라서 h3 가 비ASCII 를 털어낸다. 한국어 문구는 거기서 빈 값이 된다.
 */
function reasonOf(e: unknown) {
  if (!(e instanceof Error)) return '공개 여부를 바꾸지 못했습니다'
  const detail = e as Error & { data?: { statusMessage?: string } }
  return detail.data?.statusMessage || '공개 여부를 바꾸지 못했습니다'
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <AppBack fallback="/" label="홈으로" />
        <!-- 마크가 홈 링크를 겸한다. PWA standalone 에는 브라우저 뒤로가기가 없어서
             화면마다 상위로 가는 경로가 하나씩은 있어야 한다. -->
        <NuxtLink to="/" class="home" aria-label="pic·blog 홈">
          <BrandMark class="mark" />
          <span class="wordmark">pic<span class="dot">·</span>blog</span>
        </NuxtLink>
        <span class="mono kicker">기록 관리</span>
      </div>

      <div class="top-actions">
        <NuxtLink to="/editor/new" class="btn primary mono">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
          새 기록
        </NuxtLink>
        <button type="button" class="btn ghost mono" @click="logout">로그아웃</button>
      </div>
    </header>

    <p v-if="error" class="mono error" role="alert">{{ error }}</p>

    <!-- 아트보드 1c ① 기록 0 -->
    <section v-if="!posts.length" class="empty">
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
          <img v-if="post.cover_thumb" :src="post.cover_thumb" alt="" loading="lazy" decoding="async">
          <span v-else class="mono cover-empty">커버 없음</span>
        </span>

        <div class="main">
          <h3 class="title">
            <!--
              행 전체가 상세로 가는 링크다. ::after 로 행을 덮되 제목이 링크의 이름이 되어
              스크린리더가 「무엇으로 가는 링크인지」 읽을 수 있다.
              편집 아이콘은 그 위에 떠 있다 (.edit 의 z-index).
            -->
            <NuxtLink :to="`/p/${post.slug}`" class="stretch">{{ post.title }}</NuxtLink>
          </h3>
          <p v-if="post.summary" class="summary">{{ post.summary }}</p>
          <p class="mono meta">
            <span v-if="!post.is_public" class="private">비공개</span>
            {{ post.started_at ? formatRange(post.started_at, post.ended_at) : '기간 없음' }}
            · {{ post.point_count }} 포인트 · {{ post.photo_count }}장 · {{ formatKm(post.distance_km) }} km
          </p>
        </div>


        <NuxtLink :to="`/editor/${post.slug}`" class="edit" :aria-label="`${post.title} 편집`">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page { flex: 1; display: flex; flex-direction: column; min-height: 0; }

.topbar {
  height: 60px;
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
  height: calc(60px + var(--top-inset));
  background: var(--s0);
}
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.home { display: flex; align-items: center; gap: 12px; color: var(--ink); }
.mark { flex: none; }
.wordmark {
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.wordmark .dot { color: var(--deep); }
.kicker { font-size: 10.5px; letter-spacing: 0.16em; color: var(--deep); }

.top-actions { display: flex; align-items: center; gap: 9px; flex: none; }

.btn {
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: var(--radius);
  padding: 8px 14px;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.btn.primary { background: var(--mid); color: var(--s0); }
.btn.ghost { border: 1px solid rgba(177, 199, 193, 0.2); color: var(--mid); }
.btn.ghost:hover { border-color: rgba(146, 178, 169, 0.45); color: var(--ink); }
.btn.big { padding: 12px 20px; font-size: 12px; }

.error {
  margin: 14px 32px 0;
  padding: 10px 13px;
  border: 1px solid rgba(255, 128, 128, 0.4);
  background: rgba(255, 128, 128, 0.08);
  border-radius: var(--radius);
  font-size: 11px;
  line-height: 1.6;
  color: var(--danger);
}

.list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 22px 32px;
  list-style: none;
  align-content: start;
}

.row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 14px 18px;
  background: var(--s2);
  border: 1px solid rgba(177, 199, 193, 0.13);
  border-radius: var(--radius);
  transition: border-color 0.14s;
}
.row { position: relative; cursor: pointer; }
.row:hover { border-color: rgba(146, 178, 169, 0.45); }

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
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--faint);
  white-space: nowrap;
}

.main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.title {
  font-size: 19px;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary {
  font-size: 13px;
  line-height: 1.5;
  color: var(--mid);
  opacity: 0.82;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta { font-size: 10.5px; color: var(--deep); }
/* 공개 토글은 편집 1단계로 갔다. 목록에는 상태만 남긴다 — 컨트롤이 아니라 표시다. */
.private {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 5px;
  border: 1px solid rgba(177, 199, 193, 0.28);
  border-radius: 4px;
  color: var(--mid);
}

.switch input { position: absolute; width: 42px; height: 24px; margin: 0; opacity: 0; cursor: pointer; }
.switch input:disabled { cursor: default; }
.switch input:checked ~ .track { background: rgba(146, 178, 169, 0.9); }
.switch input:checked ~ .track .knob { transform: translateX(18px); background: var(--s0); }
.switch input:focus-visible ~ .track { box-shadow: var(--focus-ring); }
.switch input:disabled ~ .track { opacity: 0.45; }

/* 행 전체를 덮는 투명 링크. 위에 떠야 하는 것(.edit)만 z-index 로 빠져나온다. */
.stretch { color: inherit; }
.stretch::after { content: ''; position: absolute; inset: 0; z-index: 1; }

/* 우측 끝 편집 — 아이콘 전용이라 상자를 두르지 않는다 */
.edit {
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
.edit:hover { color: var(--ink); background: rgba(146, 178, 169, 0.12); }
.edit:active { background: rgba(146, 178, 169, 0.18); }

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

@media (max-width: 900px) {
  .topbar { height: calc(54px + var(--top-inset)); padding: var(--top-inset) 16px 0; gap: 10px; }
  /* 모바일 헤더 = [뒤로] [화면 이름] [주 액션]. 브랜드는 통째로 접는다 —
     어느 화면인지가 브랜드보다 중요하고, 홈은 뒤로가기가 가리킨다.
     .home 까지 숨기는 이유: 안이 비면 0x0 으로 찌부러져 보이지도 눌리지도 않는
     죽은 링크가 남는다. 실제로 그랬다. */
  .home, .wordmark, .mark, .markbtn { display: none; }
  .kicker {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .error { margin: 12px 16px 0; }
  .list { gap: 10px; padding: 16px; }

  /* 모바일은 세로 스택 — 토글·링크는 44px 터치 타깃으로 한 줄씩 내려온다 */
  /* 커버 | 본문 | 토글 | ⋯ 네 칸을 한 줄에 — 64+42+44+간격 을 빼고 남는 폭이 제목 몫이다 */
  .row { grid-template-columns: 64px minmax(0, 1fr) auto; gap: 10px; padding: 12px; align-items: start; }
  /* 제목 칸이 186px 밖에 안 되어 한 줄 ellipsis 로는 「2026.04.14 – 04.15 …」 가 된다.
     목록에서 세로는 싸고 가로는 비싸다 — 두 줄까지 흐르게 두고 그 다음에 자른다. */
  .title {
    font-size: 15px;
    white-space: normal;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .summary { display: none; }
  .meta { font-size: 10px; line-height: 1.5; }
  .edit { align-self: center; width: 44px; height: 44px; }
  .cover { width: 64px; height: 48px; }
  /* 편집·보기는 ⋯ 로 접는다 — 행마다 폭 전체 버튼 두 개를 깔면 목록이 두 배로 길어진다.
     토글은 남긴다(상태가 한눈에 보여야 한다). 옆의 「공개/비공개」 글자는 스위치가
     이미 같은 정보를 주므로 폭을 위해 접는다. aria-label 은 그대로 남아 있다. */
  .wide-only { display: none; }
}
</style>
