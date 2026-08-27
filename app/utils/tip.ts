import type { Directive } from 'vue'

/**
 * `v-tip` — 「…」로 잘린 글자의 전체를 보여주는 툴팁.
 *
 * 잘리지 «않았을» 때는 아무 일도 하지 않는다. 늘 뜨면 다 보이는 제목 위에도 상자가
 * 튀어나와 방해만 된다 — scrollWidth 로 실제로 넘쳤는지 매번 확인한다.
 *
 * 두 경로가 다 필요하다:
 *   데스크탑  마우스오버
 *   모바일    꾹 누르기 (LONG_PRESS_MS)
 *
 * title 속성을 쓰지 않는 이유: 네이티브 툴팁은 데스크탑 hover 에서만 뜬다.
 * 모바일에는 경로가 아예 없고, 스타일도 못 맞춘다.
 *
 * 🔴 이 글자는 보통 «링크 안»에 있다. 꾹 눌렀다 떼면 그대로 click 이 되어 화면이
 *    넘어가 버리므로, 툴팁을 띄운 그 제스처의 click 한 번은 삼킨다.
 *    시간이 아니라 «플래그»로 삼킨다 — 처음엔 400ms 짜리 리스너로 막았는데,
 *    툴팁을 읽느라 그보다 오래 붙잡고 있다가 떼면 그대로 링크가 열렸다.
 *    iOS 의 링크 미리보기 콜아웃도 같이 막아야 한다 (base.css 의 .has-tip).
 */

const LONG_PRESS_MS = 1000
/** 꾹 누르는 동안 이만큼 넘게 움직이면 스크롤이다 — 툴팁을 띄우지 않는다 */
const MOVE_SLOP = 10
/** 터치로 띄운 툴팁은 스스로 사라진다. 뗄 때 닫으면 읽을 시간이 없다. */
const TOUCH_HOLD_MS = 2600

let tip: HTMLElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

function ensureTip() {
  if (tip?.isConnected) return tip
  tip = document.createElement('div')
  tip.className = 'eltip'
  tip.setAttribute('role', 'tooltip')
  document.body.appendChild(tip)
  return tip
}

function hide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
  tip?.remove()
  tip = null
}

/** 넘치지 않았으면 false — 그때는 툴팁 자체를 만들지 않는다 */
function truncated(el: HTMLElement) {
  return el.scrollWidth > el.clientWidth + 1
}

function show(el: HTMLElement, autoHide: boolean) {
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

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = autoHide ? setTimeout(hide, TOUCH_HOLD_MS) : null
}

export const vTip: Directive<HTMLElement> = {
  mounted(el) {
    el.classList.add('has-tip')

    let timer: ReturnType<typeof setTimeout> | null = null
    /** 이 제스처가 툴팁을 띄웠다 = 뒤따르는 click 한 번은 링크가 아니다 */
    let armed = false
    let x = 0
    let y = 0

    const clearTimer = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }

    /**
     * 「대상 단계」에서 걸리므로 여기서 전파를 끊으면 조상 <a> 의 클릭 핸들러가 아예 안 돈다.
     * preventDefault 는 앵커의 기본 이동까지 막는다.
     */
    const onClick = (e: MouseEvent) => {
      if (!armed) return
      armed = false
      e.preventDefault()
      e.stopPropagation()
    }

    const onEnter = () => { if (truncated(el)) show(el, false) }

    const onDown = (e: PointerEvent) => {
      // 새 제스처가 시작됐다 — 지난 번 플래그가 남아 엉뚱한 클릭을 삼키지 않게 먼저 푼다
      armed = false
      if (e.pointerType === 'mouse') return
      x = e.clientX
      y = e.clientY
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        if (!truncated(el)) return
        show(el, true)
        armed = true
      }, LONG_PRESS_MS)
    }

    const onMove = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - x, e.clientY - y) > MOVE_SLOP) clearTimer()
    }

    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', hide)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', clearTimer)
    el.addEventListener('pointercancel', clearTimer)
    el.addEventListener('click', onClick, { capture: true })
    // 꾹 누르면 iOS·안드로이드가 자기 메뉴를 띄운다 — 우리 툴팁과 겹친다
    el.addEventListener('contextmenu', (e) => e.preventDefault())

    Object.assign(el, { __tipCleanup: () => { clearTimer(); hide() } })
  },

  beforeUnmount(el) {
    const holder = el as HTMLElement & { __tipCleanup?: () => void }
    holder.__tipCleanup?.()
  },
}
