<script setup lang="ts">
/**
 * 모바일 헤더의 뒤로가기.
 *
 * 모바일에서는 헤더 좌측 뒤로가기가 기본 관용구다. 홈 화면에 추가한 PWA 에는
 * 브라우저 뒤로가기도 주소창도 없어 없으면 화면에 갇히기까지 한다.
 * 데스크탑에는 「목록」 같은 명시 링크가 따로 있어 숨긴다.
 *
 * 히스토리가 없으면(그 화면으로 바로 들어왔을 때) fallback 으로 간다 —
 * router.back() 만 믿으면 아무 일도 안 일어나는 막다른 골목이 된다.
 */
const props = withDefaults(defineProps<{
  fallback: string
  label?: string
  /**
   * 값이 있으면 히스토리 대신 이걸 부른다.
   * 한 화면 안에 단계가 있는 곳(새 기록 업로드)에서 ← 는 「이전 단계」여야 한다 —
   * 그냥 두면 2단계에서 ← 를 눌렀을 때 고른 사진을 통째로 버리고 페이지를 떠난다.
   */
  intercept?: () => void
}>(), {
  label: '뒤로',
  intercept: undefined,
})

const router = useRouter()

function back() {
  if (props.intercept) {
    props.intercept()
    return
  }
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
/* 데스크탑에는 명시 링크가 따로 있다 — 모바일에서만 나타난다 */
.appback { display: none; }

@media (max-width: 900px) {
  .appback {
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    margin-left: -8px;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--mid);
    cursor: pointer;
  }
  .appback:active { background: rgb(var(--acc-rgb) / 0.14); color: var(--ink); }
  .appback:focus-visible { outline: 2px solid var(--focus-border); outline-offset: 2px; }
}
</style>
