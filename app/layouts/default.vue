<template>
  <div class="shell">
    <slot />
    <UpdateBanner />
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
