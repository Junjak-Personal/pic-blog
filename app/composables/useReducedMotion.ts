/** Reactive for controls (e.g. Swiper) whose motion is driven by JavaScript. */
export function useReducedMotion() {
  const reduced = ref(false)
  onMounted(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reduced.value = query.matches }
    update()
    query.addEventListener('change', update)
    onBeforeUnmount(() => query.removeEventListener('change', update))
  })
  return readonly(reduced)
}
