<script setup lang="ts">
/**
 * 쓰기 전체가 이 레이아웃 아래에 있다. 진입 조건이 비밀번호다 (설계문서 §7).
 * 라우트 단위가 아니라 레이아웃 단위 게이트 — 세션이 없으면 어떤 페이지든 비밀번호 화면으로 떨어진다.
 */
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="shell">
    <EditorGate v-if="!loggedIn" />
    <slot v-else />
  </div>
</template>

<style scoped>
.shell {
  /*
   * standalone + viewport-fit=cover 에서는 레이아웃 뷰포트가 상태바 밑까지 올라간다.
   * 그대로 두면 상단바가 시스템 상태바 영역에 깔려 흐릿하게 겹쳐 보인다.
   * 브라우저에서는 이 값이 0 이라 아무 변화도 없다.
   */
  padding-top: env(safe-area-inset-top);
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--s1);
}
</style>
