import type { Directive } from 'vue'

/**
 * `v-tip` — 「…」로 잘린 글자의 전체를 보여주는 툴팁. «마우스 전용»이다.
 *
 * 잘리지 «않았을» 때는 아무 일도 하지 않는다. 늘 뜨면 다 보이는 제목 위에도 상자가
 * 튀어나와 방해만 된다 — scrollWidth 로 실제로 넘쳤는지 매번 확인한다.
 *
 * 🔴 모바일 롱프레스 경로는 걷어냈다. 텍스트 위 롱프레스는 iOS 의 «선택·확대경»과 같은
 *    제스처라 서로 잡아먹는다. 그걸 우리 것으로 만들려면 user-select·콜아웃을 꺼야 했고
 *    (base.css 의 .has-tip 이 그것이었다), 그러면 제목을 복사할 수도 없게 된다.
 *    잘린 제목의 전체는 «상세 화면에서 눌러서» 본다 — 탭은 어떤 시스템 제스처와도
 *    겹치지 않는다 (p/[slug].vue · editor/[slug].vue 의 <dialog>).
 *
 * title 속성을 쓰지 않는 이유: 스타일을 못 맞추고 뜨는 시점도 브라우저 마음이다.
 */

let tip: HTMLElement | null = null

function ensureTip() {
  if (tip?.isConnected) return tip
  tip = document.createElement('div')
  tip.className = 'eltip'
  tip.setAttribute('role', 'tooltip')
  document.body.appendChild(tip)
  return tip
}

function hide() {
  tip?.remove()
  tip = null
}

/** 넘치지 않았으면 false — 그때는 툴팁 자체를 만들지 않는다 */
function truncated(el: HTMLElement) {
  return el.scrollWidth > el.clientWidth + 1
}

function show(el: HTMLElement) {
  const text = (el.textContent ?? '').trim()
  if (!text) return
  const node = ensureTip()
  node.textContent = text

  // 위쪽에 자리가 없으면 아래로 뒤집는다 — 목록 첫 줄에서 화면 밖으로 나가지 않게
  const r = el.getBoundingClientRect()
  const h = node.offsetHeight
  const above = r.top - h - 8 >= 4
  node.style.top = `${above ? r.top - h - 8 : r.bottom + 8}px`
  // 좌우도 화면 안으로 물린다
  const w = node.offsetWidth
  node.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`
  node.classList.add('on')

}

export const vTip: Directive<HTMLElement> = {
  mounted(el) {
    const onEnter = () => {
      if (truncated(el)) show(el)
    }
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', hide)
    Object.assign(el, { __tipCleanup: () => hide() })
  },

  beforeUnmount(el) {
    const holder = el as HTMLElement & { __tipCleanup?: () => void }
    holder.__tipCleanup?.()
  },
}
