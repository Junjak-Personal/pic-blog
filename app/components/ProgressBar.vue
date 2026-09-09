<script setup lang="ts">
const props = withDefaults(defineProps<{ value: number; total?: number; label: string }>(), { total: 100 })
const percent = computed(() => {
  const value = props.value / Math.max(1, props.total) * 100
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
})
</script>

<template>
  <div class="progress" role="progressbar" :aria-label="label" :aria-valuenow="Math.round(percent)" :aria-valuemin="0" :aria-valuemax="100">
    <span :style="{ transform: `scaleX(${percent / 100})` }" />
  </div>
</template>

<style scoped>
.progress { width: min(420px, 100%); height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-hover); }
.progress span { display: block; width: 100%; height: 100%; background: var(--acc); transform-origin: left; transition: transform var(--duration-normal) var(--ease-out); }
</style>
