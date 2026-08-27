import type { Directive } from 'vue'

/**
 * `v-sk` — 이미지 자리표시 해제.
 *
 * `<img class="sk">` 는 그림이 오기 전까지 자기 상자에 스켈레톤을 깔고 있다가,
 * 다 받으면 그림이 그 위를 덮는다. 클래스를 떼지 않으면 보이지도 않는 훑기 애니메이션이
 * 계속 돌아 200장짜리 그리드에서 그만큼 합성이 낭비된다.
 *
 * 🔴 @load 핸들러만으로는 안 된다. 서버 HTML 에 src 가 이미 들어 있어서
 *    브라우저가 하이드레이션보다 «먼저» 그림을 다 받아버리는 경우가 흔하고,
 *    그러면 리스너를 붙이는 시점엔 load 가 이미 지나가 스켈레톤이 영영 남는다
 *    (실제로 홈 커버 2장이 다 그랬다). complete 를 먼저 본다.
 *
 * error 도 같이 뗀다 — 못 받은 그림 자리에서 영원히 훑고 있으면 「오는 중」으로 읽힌다.
 * 깨진 그림의 빈 상자가 차라리 정직하다.
 */
export const vSk: Directive<HTMLImageElement> = {
  mounted(el) {
    const clear = () => el.classList.remove('sk')
    if (el.complete) {
      clear()
      return
    }
    el.addEventListener('load', clear, { once: true })
    el.addEventListener('error', clear, { once: true })
  },
}
