import type { Directive } from 'vue'

/**
 * Enter 로 «확정»하는 입력 — 한글 조합 중의 Enter 는 무시한다.
 *
 * 🔴 IME 는 Enter 를 두 번 쓴다. 「안녕하세요」를 치는 도중의 Enter 는 «조합을 끝내는»
 *    키이고, 그 다음 Enter 가 «입력을 확정하는» 키다. 앞의 것을 걸러내지 않으면 조합
 *    단계마다 값이 하나씩 들어간다 — 실제로 태그가 「안 · 안녕 · 안녕하세 · 안녕하세요」로
 *    네 개 생겼다. 영문은 조합이 없어서 이 버그가 안 보인다.
 *
 * 조합 중인 Enter 는 KeyboardEvent.isComposing 이 true 다 (구형 폴백은 keyCode 229).
 * 브라우저는 조합을 끝내는 Enter 에 대해 keydown(isComposing=true) → compositionend 순으로
 * 보내므로, isComposing 만 보면 정확히 그 한 번만 걸러진다.
 *
 * 쓰는 법:  <input v-enter="addTag">
 * preventDefault 는 여기서 한다 — 폼 안에 있으면 Enter 가 submit 으로 새어 나간다.
 */
export const vEnter: Directive<HTMLElement, () => void> = {
  mounted(el, binding) {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      if (e.isComposing || e.keyCode === 229) return
      e.preventDefault()
      binding.value()
    }
    el.addEventListener('keydown', onKeydown)
    // 언마운트될 때 떼지 않으면 편집 화면을 오갈 때마다 리스너가 쌓인다
    ;(el as HTMLElement & { _enter?: (e: KeyboardEvent) => void })._enter = onKeydown
  },
  unmounted(el) {
    const h = (el as HTMLElement & { _enter?: (e: KeyboardEvent) => void })._enter
    if (h) el.removeEventListener('keydown', h)
  },
}
