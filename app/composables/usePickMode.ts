/**
 * 「버튼을 누른 뒤 사진을 고르는」 모드 — 2단계 커버 지정 · 3단계 대표 지정이 같은 것을 쓴다.
 *
 * 상시로 「클릭 = 지정」이면 확인하려고 누른 순간, 또는 드래그하려다 손이 미끄러진 순간
 * 값이 바뀌고 되돌릴 길이 눈에 안 보인다. 버튼을 눌러 «무장»한 동안만 칸이 고를 수 있는
 * 것이 된다.
 *
 * 🔴 Esc 로 반드시 빠져나올 수 있어야 한다 — 모드에 갇히면 화면이 고장난 것으로 읽힌다.
 *    두 화면이 각자 리스너를 달고 각자 떼고 있었다. 떼는 쪽을 한 번 빠뜨리면 화면을 떠난
 *    뒤에도 Esc 가 죽은 ref 를 건드리므로, 다는 것과 떼는 것을 한 곳에 묶는다.
 */
export function usePickMode() {
  const picking = ref(false)

  function onEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') picking.value = false
  }

  onMounted(() => window.addEventListener('keydown', onEsc))
  onBeforeUnmount(() => window.removeEventListener('keydown', onEsc))

  return picking
}
