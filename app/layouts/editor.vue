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
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--s1);
}
</style>
