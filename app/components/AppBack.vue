<script setup lang="ts">
/**
 * 모바일 헤더의 뒤로가기.
 *
 * 모바일에서는 헤더 좌측 뒤로가기가 기본 관용구다. 홈 화면에 추가한 PWA 에는
 * 브라우저 뒤로가기도 주소창도 없어 없으면 화면에 갇히기까지 한다.
 * 데스크탑에는 「목록」 같은 명시 링크가 따로 있어 숨긴다.
 *
 * 가는 곳은 언제나 fallback 이다 — 이유는 아래 back() 주석에 있다.
 */
const props = withDefaults(defineProps<{
  fallback: string
  label?: string
  /**
   * 값이 있으면 히스토리 대신 이걸 부른다.
   * 한 화면 안에 단계가 있는 곳(새 기록 업로드)에서 ← 는 「이전 단계」여야 한다 —
   * 그냥 두면 2단계에서 ← 를 눌렀을 때 고른 사진을 통째로 버리고 페이지를 떠난다.
   */
  intercept?: () => void | Promise<void>
  /**
   * 넓은 화면에도 남긴다. 기본은 「모바일 전용」이다 — 데스크탑에는 「목록」 같은 명시
   * 링크가 따로 있으니까. 그 링크를 걷어낸 화면(편집·업로드)은 이걸 켜서 ← 를 남긴다.
   * OverflowMenu 의 always 와 같은 관용구다.
   */
  always?: boolean
}>(), {
  label: '뒤로',
  intercept: undefined,
  always: false,
})

/**
 * 🔴 언제나 «위»로 간다 — 온 길이 아니라.
 *
 * router.back() 을 쓰면 편집↔뷰어 바로가기 때문에 ← 가 제자리를 오간다.
 * 편집에서 「공개 화면 보기」로 넘어와 ← 를 누르면, 「기록 목록으로」라고 적힌 버튼이
 * 편집으로 되돌아간다 — 라벨이 말하는 곳과 실제 가는 곳이 달라진다. 두 화면을 몇 번
 * 오가면 ← 가 그 둘 사이를 왕복할 뿐 위로는 못 올라간다.
 * history.length 로 「돌아갈 곳이 있나」를 보던 것도 못 쓴다. 그 값은 이 앱 밖의
 * 기록까지 세기 때문에, 외부 링크로 바로 들어온 사람이 ← 를 누르면 앱을 떠난다.
 *
 * 온 길을 되짚는 것은 브라우저·기기의 뒤로가기가 이미 한다. 두 길은 나뉘어 있는 게 맞다.
 */
function back() {
  if (props.intercept) {
    // 확인창을 띄우는 자리가 있어 비동기일 수 있다 — 기다리지 않고 맡긴다
    void props.intercept()
    return
  }
  navigateTo(props.fallback)
}
</script>

<template>
  <button type="button" class="appback" :class="{ always: props.always }" :aria-label="props.label" @click="back">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6" /></svg>
  </button>
</template>

<style scoped>
/* 데스크탑에는 명시 링크가 따로 있다 — 모바일에서만 나타난다 */
.appback { display: none; }
/* 그 명시 링크가 없는 화면은 넓은 화면에도 ← 를 남긴다 (아래 모바일 규칙과 같은 모양) */
.appback.always {
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
.appback.always:hover { background: rgb(var(--acc-rgb) / 0.12); color: var(--ink); }

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
