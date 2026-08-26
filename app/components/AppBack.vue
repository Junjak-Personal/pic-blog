<script setup lang="ts">
/**
 * 앱(standalone) 전용 뒤로가기.
 *
 * 홈 화면에 추가한 PWA 에는 브라우저 뒤로가기도 주소 표시줄도 없다. 화면마다
 * 상위로 가는 길이 없으면 갇힌다 — 실제로 편집 화면에서 그랬다.
 * 브라우저에서는 뒤로가기가 이미 있으므로 숨긴다.
 *
 * 히스토리가 없으면(앱을 그 화면으로 바로 열었을 때) fallback 으로 간다 —
 * router.back() 만 믿으면 아무 일도 안 일어나는 막다른 골목이 된다.
 */
const props = withDefaults(defineProps<{ fallback: string; label?: string }>(), {
  label: '뒤로',
})

const router = useRouter()

function back() {
  if (window.history.length > 1) router.back()
  else navigateTo(props.fallback)
}
</script>

<template>
  <button type="button" class="appback" :aria-label="props.label" @click="back">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
  </button>
</template>

<style scoped>
/* 브라우저에는 자체 뒤로가기가 있다 — 앱으로 띄웠을 때만 나타난다 */
.appback { display: none; }

@media (display-mode: standalone) {
  .appback {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin-left: -8px;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--mid);
    cursor: pointer;
  }
  .appback:active { background: rgba(146, 178, 169, 0.14); color: var(--ink); }
  .appback:focus-visible { outline: 2px solid var(--focus-border); outline-offset: 2px; }
}
</style>
