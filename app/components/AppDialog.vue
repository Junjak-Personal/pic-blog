<script setup lang="ts">
/** Informational dialogs share native focus trapping, Escape and a close action. */
defineProps<{ label: string }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const closing = ref(false)
let exitAnimation: Animation | undefined

async function close() {
  const el = dialog.value
  if (!el?.open || closing.value) return
  closing.value = true
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const style = getComputedStyle(el)
    exitAnimation = el.animate([
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(4px) scale(0.98)' },
    ], {
      duration: parseFloat(style.getPropertyValue('--duration-exit')) || 150,
      easing: style.getPropertyValue('--ease-out').trim(),
      fill: 'forwards',
    })
    await exitAnimation.finished.catch(() => {})
  }
  el.close()
  exitAnimation?.cancel()
  closing.value = false
}
onBeforeUnmount(() => exitAnimation?.cancel())
defineExpose({ showModal: () => dialog.value?.showModal() })
</script>

<template>
  <dialog ref="dialog" class="dialog-surface dialog-native" :data-closing="closing || undefined" :aria-label="label" @cancel.prevent="close">
    <slot />
    <form method="dialog" class="dialog-actions" @submit.prevent="close">
      <button type="submit" class="btn foot ghost" :disabled="closing">닫기</button>
    </form>
  </dialog>
</template>

<style scoped>
.dialog-native { margin: auto; width: min(520px, calc(100vw - 32px)); }
.dialog-native[data-closing]::backdrop { animation: ui-fade-out var(--duration-exit) ease-out forwards; }
.dialog-actions { margin-top: 20px; }
</style>
