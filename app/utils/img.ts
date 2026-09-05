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
/**
 * 그림이 도착할 때까지 자기 상자에 스켈레톤을 깔아둔다.
 *
 * 🔴 complete «만» 보면 안 된다. src 가 아직 없는 <img> 도 complete 는 true 다 —
 *    지도 마커가 그렇다(칸이 화면에 들어올 때 src 를 넣는다). naturalWidth 로 가른다.
 * 🔴 리스너는 한 번만 건다. 같은 <img> 의 src 가 바뀌어 다시 무장할 때마다 걸면
 *    안 받아진 채로 여러 번 바뀐 그림에 리스너가 쌓인다.
 */
export function skWhileLoading(el: HTMLImageElement) {
  if (el.complete && el.naturalWidth > 0) {
    el.classList.remove('sk')
    return
  }
  el.classList.add('sk')
  if (el.dataset.skArmed) return
  el.dataset.skArmed = '1'
  const clear = () => {
    el.classList.remove('sk')
    delete el.dataset.skArmed
  }
  el.addEventListener('load', clear, { once: true })
  el.addEventListener('error', clear, { once: true })
}

export const vSk: Directive<HTMLImageElement> = {
  mounted: skWhileLoading,
  /*
   * src 가 «바뀌는» 경우 — Vue 가 같은 <img> 를 재사용하면 mounted 는 다시 불리지 않는다.
   * 그대로 두면 새 그림이 도착할 때까지 옛 그림이 남거나 빈 상자가 보인다.
   */
  updated: skWhileLoading,
}

/**
 * 포인트의 대표 사진 — 지정이 없거나 그 사진이 사라졌으면 첫 사진으로 내려간다.
 *
 * point.cover_photo_id 에는 일부러 FK 를 걸지 않았다(db.ts 참고). 그래서 지워진 사진을
 * 가리키고 있을 수 있고, 그때 조용히 빈 상자를 그리면 「지정했는데 아무것도 안 뜬다」가 된다.
 * 읽는 쪽이 매번 되짚는다 — 지도 마커 · 편집 목록이 같은 함수를 쓴다.
 */
export function pointThumb<T extends { id: number }>(
  point: { cover_photo_id: number | null; photos: T[] },
): T | null {
  const picked = point.cover_photo_id === null
    ? undefined
    : point.photos.find((p) => p.id === point.cover_photo_id)
  return picked ?? point.photos[0] ?? null
}
