<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <section class="empty-state">
    <span v-if="$slots.icon" class="empty-state-icon"><slot name="icon" /></span>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
    <div v-if="$slots.action" class="empty-state-action"><slot name="action" /></div>
  </section>
</template>

<style scoped>
.empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  gap: 14px;
  padding: 40px 24px;
  text-align: center;
  overflow-y: auto;
  touch-action: pan-y;
}
.empty-state-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: 6px;
  border-radius: var(--radius-xl);
  background: var(--surface-hover);
  color: var(--acc);
}
h3 { font-size: var(--fs-display); line-height: 1.4; }
p { max-width: 460px; font-size: var(--fs-lg); line-height: 1.7; color: var(--mid); text-wrap: pretty; }
.empty-state-action { margin-top: 8px; }
</style>
