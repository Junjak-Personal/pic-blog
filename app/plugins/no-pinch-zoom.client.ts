/**
 * 페이지 확대를 막는다 (아이폰에서 앱처럼 쓰기 위한 요청).
 *
 * viewport 의 user-scalable=no 만으로는 부족하다 — iOS 는 Safari 브라우저에서 그걸
 * 접근성 이유로 무시한다. standalone 에서는 먹지만, 브라우저로 열었을 때 두 손가락
 * 확대가 그대로 남아 화면마다 동작이 갈린다.
 *
 * gesturestart/change/end 는 iOS 전용 이벤트이고 페이지 확대 제스처가 여기로 온다.
 * 🔴 Mapbox 는 이 이벤트를 쓰지 않는다 — touchstart/move 로 자체 핀치를 구현한다.
 *    그래서 이걸 막아도 지도 확대는 살아 있다. 지도가 이 앱의 핵심이라
 *    여기서 지도까지 잠그면 앱을 못 쓴다.
 */
export default defineNuxtPlugin(() => {
  const block = (e: Event) => e.preventDefault()
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, block, { passive: false })
  }
})
