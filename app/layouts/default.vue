<template>
  <div class="shell">
    <slot />
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
