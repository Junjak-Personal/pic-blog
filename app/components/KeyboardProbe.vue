<script setup lang="ts">
/**
 * 키보드 진단 — 개발 서버(«pic-blog dev» 껍데기)에서만 뜬다.
 *
 * 폰에서만 나는 문제를 고치려다 네 번 미끄러졌다. 화면 밖에서 무엇이 움직이는지 못 보고
 * 추측했기 때문이다. 이 판은 포커스 전후의 «사건»을 시간순으로 쌓아 보여준다 —
 * 스샷 한 장이면 무엇이 언제 얼마나 움직였는지 확정된다.
 *
 * 🔴 화면을 건드리면 안 된다: fixed · pointer-events:none 이라 레이아웃에도 터치에도
 *    영향이 없다. 그리고 시각 뷰포트를 «따라간다» — 문서가 끌려 올라가면 붙박이 요소도
 *    같이 밀려서, 정작 봐야 할 순간에 화면 밖으로 나가버린다.
 */
interface Row {
  t: number
  ev: string
  vv: string
  win: number
  sy: number
  shell: number
  /** 문서가 굴러갈 수 있는 거리 — 「손으로 안 내려간다」를 가릴 핵심 값 */
  doc: number
  sc: string
  el: string
  /** sc 가 «어느» 상자인지 — 짐작으로 읽다 두 번 헛짚었다 */
  scName: string
}

const route = useRoute()
const rows = ref<Row[]>([])

const box = useTemplateRef<HTMLElement>('box')

/** 서버로 보내는 양 — 한 묶음을 통째로 담는다 */
const MAX = 40
/**
 * 🔴 화면에 그리는 줄 수는 따로다. 16줄이면 판이 190px 이라 그 밑의 조작 버튼을
 *    통째로 가린다 — 실험대의 모드 버튼이 실제로 안 보여 실험이 한 번 헛돌았다.
 *    보내는 것은 그대로 두고 «보이는» 것만 줄인다.
 */
const SHOWN = 6
/**
 * 이만큼 조용하면 새 묶음으로 본다.
 * 🔴 넉넉해야 한다. 900ms 였을 때 「타이틀 → 요약 → 손으로 밀기」가 세 묶음으로 쪼개져
 *    정작 봐야 할 «이어진» 순간이 로그에 없었다. 사람이 손을 옮기는 시간을 덮는다.
 */
const BURST_GAP_MS = 2500

let t0 = 0
let last = 0
/** 묶음이 끝난 뒤 서버로 보낸다 — 스샷을 찍어 옮기는 수고를 없앤다 (server/api/_probe.post.ts) */
let flush: ReturnType<typeof setTimeout> | null = null

function scrollerOf(el: Element | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if (oy === 'auto' || oy === 'scroll') return n
  }
  return null
}

/** 지금 초점이 있는 입력칸을 짧게 — testid 가 있으면 그 꼬리, 없으면 태그 */
function nameOf(el: Element | null) {
  if (!el) return '-'
  const id = el.getAttribute?.('data-testid')
  if (id) return id.replace(/^settings-/, '').replace(/-input$/, '')
  return el.tagName.toLowerCase()
}

function snap(ev: string) {
  const now = Math.round(performance.now())
  if (!t0 || now - last > BURST_GAP_MS) {
    t0 = now
    rows.value = []
  }
  last = now

  const vv = window.visualViewport
  const shell = document.querySelector<HTMLElement>('.shell')
  const active = document.activeElement
  const sc = scrollerOf(active) ?? document.querySelector<HTMLElement>('.scroll-y')
  const scName = sc ? (sc.className.trim().split(/\s+/).slice(0, 2).join('.') || sc.tagName.toLowerCase()) : '-'
  const r = active instanceof HTMLElement ? Math.round(active.getBoundingClientRect().top) : 0

  rows.value = [
    ...rows.value.slice(-(MAX - 1)),
    {
      t: now - t0,
      ev,
      vv: vv ? `${Math.round(vv.height)}+${Math.round(vv.offsetTop)}` : '-',
      win: window.innerHeight,
      sy: Math.round(window.scrollY),
      shell: shell?.offsetHeight ?? 0,
      doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      sc: sc ? `${Math.round(sc.scrollTop)}/${sc.scrollHeight}/${sc.clientHeight}` : '-',
      el: `${nameOf(active)}@${r}`,
      scName,
    },
  ]

  // 문서가 끌려도 이 판만은 보이는 자리에 남는다
  if (box.value && vv) box.value.style.transform = `translateY(${Math.round(vv.offsetTop)}px)`

  // 사건이 멎으면 한 묶음으로 올린다
  if (flush) clearTimeout(flush)
  flush = setTimeout(send, BURST_GAP_MS)
}

const sent = ref(0)

async function send() {
  flush = null
  const lines = rows.value.map(
    (r) => `${String(r.t).padStart(5)} ${r.ev.padEnd(9)} vv=${r.vv.padEnd(9)} win=${String(r.win).padEnd(4)}`
      + ` sy=${String(r.sy).padEnd(4)} doc=${String(r.doc).padEnd(4)} shell=${String(r.shell).padEnd(5)}`
      + ` ${r.scName.padEnd(16)} ${r.sc.padEnd(16)} ${r.el}`,
  )
  if (lines.length < 2) return
  try {
    await $fetch('/api/_probe', { method: 'POST', body: { label: `${lines.length}건 · ${route.fullPath}`, lines } })
    sent.value++
  } catch {
    // 서버가 잠깐 없어도 화면의 표는 그대로 남는다 — 그때는 스샷이 대안이다
  }
}

onMounted(() => {
  const vv = window.visualViewport
  const on = (
    target: EventTarget | null,
    type: string,
    label: string,
    opts?: AddEventListenerOptions,
  ) => {
    if (!target) return () => {}
    const h = () => snap(label)
    target.addEventListener(type, h, opts)
    return () => target.removeEventListener(type, h, opts)
  }

  const offs = [
    // 마지막 묶음이 안 올라간 채 화면을 뜨는 일이 없게
    on(window, 'pagehide', 'pagehide'),
    on(document, 'focusin', 'focusIN'),
    on(document, 'focusout', 'focusOUT'),
    on(vv, 'resize', 'vvRESIZE'),
    on(vv, 'scroll', 'vvSCROLL'),
    // 🔴 스크롤은 버블링하지 않는다 — 안쪽 스크롤러가 굴러가는 것을 보려면 캡처여야 한다
    on(document, 'scroll', 'SCROLL', { capture: true, passive: true }),
    /*
     * 손가락이 «닿았는데» 굴러가지 않는지 가른다. touchmove 는 초당 수십 번 와서 표를
     * 밀어내므로 시작과 끝만 남긴다 — 그 사이에 SCROLL 이 하나도 없으면 제스처가
     * 삼켜진 것이고, touchstart 조차 없으면 손가락이 페이지에 닿지도 않은 것이다.
     */
    on(document, 'touchstart', 'touchSTART', { capture: true, passive: true }),
    on(document, 'touchend', 'touchEND', { capture: true, passive: true }),
  ]
  snap('start')
  onBeforeUnmount(() => {
    if (flush) clearTimeout(flush)
    offs.forEach((off) => off())
  })
})
</script>

<template>
  <div ref="box" class="probe mono">
    <div class="head">보낸묶음 {{ sent }} | t | event | vv h+off | sy | doc여지 | scroller | focus@top</div>
    <div v-for="(r, i) in rows.slice(-SHOWN)" :key="i" class="row">
      {{ String(r.t).padStart(4) }} {{ r.ev.padEnd(9) }} {{ r.vv.padEnd(8) }} {{ String(r.sy).padEnd(4) }} doc{{ String(r.doc).padEnd(4) }} {{ r.sc.padEnd(14) }} {{ r.el }}
    </div>
  </div>
</template>

<style scoped>
.probe {
  position: fixed;
  z-index: 9999;
  top: 0;
  right: 0;
  left: 0;
  /* 판이 화면을 «막지» 않는다 — 터치는 그대로 아래로 지나간다 */
  pointer-events: none;
  padding: 3px 4px;
  background: rgb(0 0 0 / 0.86);
  color: #7cff9b;
  font-size: 8px;
  line-height: 1.3;
  white-space: pre;
  overflow: hidden;
}
.head { color: #6b8fa0; }
.row:last-child { color: #ffd479; }
</style>
