/**
 * 사진 칸 드래그 엔진 — 편집 2단계 보드가 쓴다.
 *
 * Pointer Events 한 벌로 마우스·터치·펜을 모두 처리한다. HTML5 네이티브 드래그앤드롭은
 * 터치 기기에서 아예 동작하지 않아 예전에 한 번 갈아탔고, 여기서도 되돌리지 않는다.
 * dragdroptouch 같은 폴리필은 「네이티브 DnD 로 되돌아가는」 선택이라 쓰지 않고,
 * 그 라이브러리가 잘 하는 «세 가지 행동»만 가져왔다:
 *
 *   1. 터치는 롱프레스(400ms)로 시작한다 — 이동 임계만 쓰면 세로 스크롤과 싸운다.
 *      실제로 그룹을 넘나드는 이동이 스크롤에 계속 먹혔다. 마우스는 즉시 잡는다.
 *      예외는 손잡이(data-handle)다 — 그건 끌라고 있는 것이라 누르는 즉시 시작한다.
 *   2. 손가락을 따라다니는 반투명 고스트 — 원본 칸만 흐려지면 뭘 끌고 있는지 안 보인다.
 *   3. 가장자리 자동 스크롤 — 이게 없으면 화면 밖 포인트로는 옮길 방법이 없다.
 *
 * 🔴 터치 스크롤 차단은 touch-action 이 아니라 touchmove.preventDefault() 로 한다.
 *    칸에 touch-action: none 을 걸면 사진 위에서는 목록을 스크롤할 수 없게 되는데,
 *    보드는 화면 대부분이 사진이라 그건 목록을 통째로 못 굴리는 것과 같다.
 *    롱프레스가 끝날 때까지 손가락이 멈춰 있었으므로 브라우저도 아직 스크롤을 시작하지
 *    않았고, 그 다음 첫 touchmove 는 취소 가능하다 — 거기서 막으면 정확히 맞는다.
 */

/** 드래그 중인 사진이 어디서 왔는지 */
export interface DragFrom {
  /** 출발 그룹의 초안 id */
  groupId: number
  photoId: number
}

/** 지금 손끝이 가리키는 자리 */
export interface DragOver {
  /** 도착 그룹의 초안 id. null 이면 「새 포인트로 분리」 영역 */
  groupId: number | null
  /** 그룹 안에서 끼어들 위치. 그룹 끝이면 사진 수와 같다 */
  index: number
}

const LONG_PRESS_MS = 400
/** 롱프레스가 익는 동안 이만큼 넘게 움직이면 스크롤로 본다 */
const LONG_PRESS_SLOP = 10
/** 마우스·펜은 기다리지 않는다 — 이만큼 움직이면 곧바로 드래그 */
const MOUSE_SLOP = 5
/** 이 안쪽으로 들어오면 목록이 저절로 굴러간다 */
const EDGE_PX = 72
/**
 * 가장자리 자동 스크롤의 «최고» 속도 — 초당 픽셀.
 *
 * 🔴 프레임당 상수(예전의 14px)로 재면 안 된다. rAF 는 화면 주사율을 따르므로 같은 코드가
 *    60Hz 에서 840px/s, ProMotion 120Hz 에서 1680px/s 로 «두 배» 빨라진다. 아이폰에서
 *    포인트 하나가 176px 쯤이니 초당 9~10개씩 지나간 셈이고, 「40번에서 끌었는데 12번으로
 *    가 있다」는 보고가 정확히 그것이었다. 시간으로 재면 기기가 달라도 같은 속도다.
 *
 * 최고 속도로도 초당 3개 남짓이라 눈으로 따라갈 수 있다.
 */
const EDGE_SPEED_PPS = 600

export function useTileDrag(onDrop: (from: DragFrom, over: DragOver) => void) {
  const from = ref<DragFrom | null>(null)
  const over = ref<DragOver | null>(null)
  /** true = 실제로 끌고 있는 중. from 만 있고 이게 false 면 아직 롱프레스를 기다리는 상태다 */
  const dragging = ref(false)
  /**
   * 방금 «끈» 제스처인가.
   * 🔴 포인터를 캡처한 칸에서는 드래그가 끝난 뒤에도 click 이 한 번 따라온다. 그걸
   *    그냥 두면 사진을 옮길 때마다 라이트박스가 열린다 — 그 한 번은 삼켜야 한다.
   *    시간이 아니라 플래그로 삼키고, 다음 pointerdown 에서 푼다 (utils/tip.ts 와 같은 처방).
   */
  const dragged = ref(false)

  let ghost: HTMLElement | null = null
  /** 자동 스크롤 대상. null 이면 «문서 자체»를 굴린다 — 아래 scrollTargetOf 참고. */
  let scroller: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let raf = 0
  /** 자동 스크롤의 직전 프레임 시각. 0 이면 「띠 밖」이라 다음 프레임이 기준을 다시 잡는다. */
  let lastTs = 0
  let startX = 0
  let startY = 0
  let lastY = 0
  let pointerType = 'mouse'

  function makeGhost(tile: HTMLElement, x: number, y: number) {
    const rect = tile.getBoundingClientRect()
    const el = tile.cloneNode(true) as HTMLElement
    el.className = 'tile-ghost'
    el.style.width = `${rect.width}px`
    el.style.height = `${rect.height}px`
    el.dataset.dx = String(rect.left - x)
    el.dataset.dy = String(rect.top - y)
    document.body.appendChild(el)
    ghost = el
    moveGhost(x, y)
  }

  function moveGhost(x: number, y: number) {
    if (!ghost) return
    const dx = Number(ghost.dataset.dx ?? 0)
    const dy = Number(ghost.dataset.dy ?? 0)
    ghost.style.transform = `translate(${x + dx}px, ${y + dy}px)`
  }

  /**
   * 실제로 굴러가는 조상을 찾는다. 없으면 null — 그때는 문서를 굴린다.
   *
   * 🔴 `.scroll-y` 를 그냥 집으면 안 된다. 편집 화면의 셸은 min-height: 100dvh 라
   *    보드가 내용만큼 자라고(문서가 대신 스크롤된다), 그 상태의 보드는 overflow-y: auto 여도
   *    scrollHeight == clientHeight 라 scrollTop 을 아무리 밀어도 꿈쩍하지 않는다.
   *    실제로 그래서 자동 스크롤이 조용히 아무 일도 안 했다.
   */
  function scrollTargetOf(el: HTMLElement): HTMLElement | null {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n
    }
    return null
  }

  /**
   * 가장자리 자동 스크롤 — 손끝이 위/아래 끝에 머무는 동안만 돈다.
   *
   * 속도는 «시간»과 «깊이»로 정한다.
   *   시간 — 프레임 간격을 곱한다. 그래야 60Hz 든 120Hz 든 같은 속도다 (EDGE_SPEED_PPS 의 🔴).
   *   깊이 — 가장자리 띠에 얼마나 깊이 들어왔는지에 비례한다. 경계에서는 거의 안 움직이고
   *          더 밀어 넣을수록 빨라진다. 예전에는 띠에 «닿는 순간» 최고 속도였는데,
   *          띠가 72px 이고 폰의 보드는 300~500px 이라 의도치 않게 들어가기 쉬웠다.
   */
  function edgeScroll(now: number) {
    raf = 0
    if (!dragging.value) return
    const rect = scroller?.getBoundingClientRect()
    const top = rect ? rect.top : 0
    const bottom = rect ? rect.bottom : window.innerHeight

    // 첫 프레임은 간격을 모른다 — 움직이지 않고 기준 시각만 잡는다.
    // 탭을 다시 보는 등으로 간격이 크게 벌어졌을 때 한 번에 튀지 않게 위도 자른다.
    const dt = lastTs ? Math.min((now - lastTs) / 1000, 0.05) : 0
    lastTs = now

    /** 띠 안쪽으로 들어온 정도 (0~1). 방향은 부호로 판다. */
    let depth = 0
    if (lastY < top + EDGE_PX) depth = -Math.min(1, (top + EDGE_PX - lastY) / EDGE_PX)
    else if (lastY > bottom - EDGE_PX) depth = Math.min(1, (lastY - (bottom - EDGE_PX)) / EDGE_PX)
    else {
      lastTs = 0
      return
    }

    const dy = depth * EDGE_SPEED_PPS * dt
    if (scroller) scroller.scrollTop += dy
    else window.scrollBy(0, dy)

    // 굴러간 만큼 손끝 아래의 칸이 바뀐다 — 다시 훑어야 드롭 위치가 따라온다
    resolveOver(Number(ghost?.dataset.px ?? 0), lastY)
    raf = requestAnimationFrame(edgeScroll)
  }

  /**
   * 드롭 자리를 «달라졌을 때만» 바꾼다.
   * 🔴 매번 새 객체를 넣으면 값이 그대로여도 ref 가 트리거된다. 보드 템플릿이 이걸 읽으므로
   *    손가락이 한 칸 위에 가만히 있는 동안에도 보드 전체가 초당 60~120번 다시 그려진다.
   */
  function setOver(v: DragOver | null) {
    const o = over.value
    if (o?.groupId === v?.groupId && o?.index === v?.index) return
    over.value = v
  }

  /** 손끝 좌표 → 드롭 자리. 포인터가 잡혀 있어 e.target 은 늘 출발 칸이라 좌표로 찾는다. */
  function resolveOver(x: number, y: number) {
    const el = document.elementFromPoint(x, y)
    if (!el) return

    const zone = el.closest<HTMLElement>('[data-newzone]')
    if (zone) {
      setOver({ groupId: null, index: 0 })
      return
    }

    const group = el.closest<HTMLElement>('[data-group]')
    if (!group) {
      setOver(null)
      return
    }
    const groupId = Number(group.dataset.group)

    const tile = el.closest<HTMLElement>('[data-tile]')
    if (!tile) {
      // 그룹의 빈 여백 — 맨 뒤에 붙인다
      setOver({ groupId, index: Number(group.dataset.count) })
      return
    }
    // 칸의 왼쪽 절반이면 그 앞, 오른쪽 절반이면 그 뒤
    const r = tile.getBoundingClientRect()
    const i = Number(tile.dataset.tile)
    setOver({ groupId, index: x > r.left + r.width / 2 ? i + 1 : i })
  }

  function begin(tile: HTMLElement, x: number, y: number) {
    dragging.value = true
    scroller = scrollTargetOf(tile)
    makeGhost(tile, x, y)
    resolveOver(x, y)
  }

  function onPointerDown(e: PointerEvent, source: DragFrom) {
    if (e.button !== 0) return
    // 새 제스처다 — 지난 드래그의 플래그가 남아 엉뚱한 클릭을 삼키지 않게 먼저 푼다
    dragged.value = false

    const target = e.target as HTMLElement
    // 손잡이는 「끌라고 있는 것」이라 기다리지 않는다. 이걸 잡고도 1초를 기다려야 하면
    // 고장난 것으로 읽힌다 — 실제로 손잡이가 아무 반응이 없다는 지적을 받았다.
    const onHandle = !!target.closest('[data-handle]')
    // 칸 안의 다른 버튼(삭제)을 누른 것이면 드래그가 아니다 — setPointerCapture 를 걸면
    // 그 뒤의 click 이 캡처한 요소로 재타깃돼 버튼이 영영 안 눌린다.
    if (!onHandle && target.closest('button')) return

    const tile = (e.currentTarget as HTMLElement)
    pointerType = e.pointerType
    from.value = source
    startX = e.clientX
    startY = e.clientY
    lastY = e.clientY
    tile.setPointerCapture(e.pointerId)

    if (onHandle) {
      begin(tile, e.clientX, e.clientY)
      return
    }
    if (pointerType === 'touch') {
      timer = setTimeout(() => {
        timer = null
        if (from.value) begin(tile, startX, startY)
      }, LONG_PRESS_MS)
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!from.value) return
    lastY = e.clientY

    if (!dragging.value) {
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY)
      if (pointerType === 'touch') {
        // 롱프레스가 익기 전에 움직였다 = 스크롤하려는 것이다. 조용히 물러난다.
        if (moved > LONG_PRESS_SLOP) cancel()
        return
      }
      if (moved < MOUSE_SLOP) return
      begin(e.currentTarget as HTMLElement, e.clientX, e.clientY)
    }

    if (ghost) ghost.dataset.px = String(e.clientX)
    moveGhost(e.clientX, e.clientY)
    resolveOver(e.clientX, e.clientY)
    if (!raf) raf = requestAnimationFrame(edgeScroll)
  }

  function onPointerUp() {
    const f = from.value
    const o = over.value
    const was = dragging.value
    cancel()
    dragged.value = was
    if (was && f && o) onDrop(f, o)
  }

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    lastTs = 0
    ghost?.remove()
    ghost = null
    scroller = null
    from.value = null
    over.value = null
    dragging.value = false
  }

  /**
   * 드래그 중에만 브라우저 스크롤을 막는다. 보드 루트에 non-passive 로 붙여야 하고
   * (Vue 의 기본 리스너가 그렇다), 드래그 중이 아니면 손대지 않는다 — 안 그러면
   * 사진 위에서 목록을 굴릴 수 없게 된다.
   */
  function onTouchMove(e: TouchEvent) {
    if (dragging.value && e.cancelable) e.preventDefault()
  }

  onBeforeUnmount(cancel)

  return { from, over, dragging, dragged, onPointerDown, onPointerMove, onPointerUp, onTouchMove, cancel }
}
