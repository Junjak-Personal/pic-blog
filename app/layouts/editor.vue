<script setup lang="ts">
import UpdateBanner from '~/components/UpdateBanner.vue'
import ConfirmDialog from '~/components/ConfirmDialog.vue'
import KeyboardProbe from '~/components/KeyboardProbe.vue'
/**
 * 쓰기 전체가 이 레이아웃 아래에 있다. 진입 조건이 비밀번호다 (설계문서 §7).
 * 라우트 단위가 아니라 레이아웃 단위 게이트 — 세션이 없으면 어떤 페이지든 비밀번호 화면으로 떨어진다.
 */
const { loggedIn } = useUserSession()
/** 개발 서버로 띄웠는가 — 운영 번들에서는 상수 false 라 진단이 통째로 빠진다 */
const dev = import.meta.dev

/** 셸 자체를 잡는다 — 시각 뷰포트가 밀릴 때 반대로 되밀어야 한다 (아래 onVvScroll) */
const shellEl = useTemplateRef<HTMLElement>('shellEl')

/**
 * 키보드가 올라온 만큼 셸을 줄인다 (--vvh).
 *
 * 가상 키보드는 «레이아웃» 뷰포트를 건드리지 않는다 — 시각 뷰포트만 줄인다는 것이
 * 기본 동작이고, 그래서 100dvh 는 키보드가 떠도 화면 전체 높이 그대로다.
 * 이 셸은 문서를 스크롤하지 않는 구조라(아래 .shell 주석) 내용이 뷰포트에 딱 맞고,
 * 실제로 편집 1단계는 문서도 안쪽 스크롤러도 «스크롤 여지가 0» 이었다
 * (390×844 실측: document 0px, .settings scrollHeight == clientHeight).
 *
 * 그 상태에서 입력을 누르면 WebKit 은 캐럿을 키보드 위로 올려야 하는데 쓸 수 있는
 * 스크롤 상자가 하나도 없으므로, 마지막 수단으로 웹뷰 자신의 스크롤뷰를 움직여
 * 문서를 통째로 끌어올린다 — 헤더도 입력칸도 화면 밖으로 나가고 position: fixed 인
 * 하단 CTA 만 남는다. 타이틀에서 요약으로 «옮길 때» 특히 그랬다 (키보드가 이미 올라온
 * 상태에서의 두 번째 포커스라 줄지 않은 레이아웃 기준으로 다시 계산한다).
 *
 * 높이를 시각 뷰포트에 묶으면 안쪽 스크롤러가 제 몫의 여지를 되찾아(같은 화면을
 * 390×414 로 재면 413px) WebKit 이 문서를 끌어올릴 이유가 사라진다.
 *
 * 🔴 CSS 변수로 넣는다. ref + :style 로 하면 키보드 애니메이션 동안 레이아웃이
 *    Vue 리렌더를 타고 흐른다. 값만 바꾸면 스타일 계산 한 번으로 끝난다.
 *
 * 🔴 이 값 하나가 SSOT 다. 한때 「키보드가 먹은 높이(--kb)」를 따로 내보내 하단 CTA 를
 *    밀었는데, 둘이 서로 다른 시점에 들어와 첫 포커스에서 CTA 가 엉뚱한 자리에 섰다.
 *    지금 CTA 는 셸의 마지막 칸에 absolute 로 붙어 이 값을 그냥 «따라간다» (BottomCta).
 */

/**
 * 넉넉히 잡는 임시 여지 — 정확한 키보드 높이를 모르는 «첫 프레임»에만 쓰인다 (아래 onFocusIn).
 * --cta-h 를 더하는 것은 이 값이 스타일시트의 하단 여백을 «덮어쓰기» 때문이다.
 * 그냥 50vh 로 두면 그동안 내용이 하단 CTA 밑으로 숨는다.
 */
const RESERVE = 'calc(50vh + var(--cta-h, 0px))'

/**
 * 가장 가까운 스크롤 컨테이너.
 * 🔴 useTileDrag 의 같은 이름과 조건이 다르다 — 그쪽은 «실제로 굴러가는» 것만 찾지만
 *    여기는 여지가 0 인 것을 «찾아서 만들어 주는» 게 목적이라 overflow 만 본다.
 */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if (oy === 'auto' || oy === 'scroll') return n
  }
  return null
}

function isTyping(el: HTMLElement) {
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  return !/^(checkbox|radio|button|submit|reset|range|color|file)$/.test((el as HTMLInputElement).type)
}

onMounted(() => {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let raf = 0
  let padded: HTMLElement | null = null
  let settle: ReturnType<typeof setTimeout> | null = null

  const release = () => {
    if (!padded) return
    padded.style.paddingBottom = ''
    padded = null
  }

  const apply = () => {
    raf = 0
    // 키보드가 올라와 있는가 — 임시 여백을 언제 걷을지 판단하는 데만 쓴다
    const shrunk = vv.height < window.innerHeight - 1
    root.style.setProperty('--vvh', `${vv.height}px`)
    // 셸이 줄어 «진짜» 여지가 생겼다 — 임시 여백은 그 몫을 다했다
    if (shrunk) release()
    // 이미 끌려 올라간 뒤일 수 있다 — 문서를 제자리로 돌린다
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
  }
  // 키보드는 여러 프레임에 걸쳐 올라온다 — 프레임마다 한 번만 쓴다
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply) }

  /**
   * WebKit 이 «시각 뷰포트»를 밀면 셸을 같은 만큼 되밀어 눈에는 안 움직이게 한다.
   *
   * 기기 진단이 확정해 준 것: 키보드가 이미 올라온 상태에서 포커스를 옮기면
   * visualViewport.offsetTop 이 -396(= 키보드 높이)이 되었다가 ~15ms 뒤 0 으로 돌아온다.
   * 그동안 초점 칸이 268 → 664 로 내려갔다 온다. 그게 눈에 보이는 「이상한 이동」이다.
   *
   * 🔴 스크롤이 «아니다». 안쪽 스크롤러는 내내 scrollTop 0 이었고, 문서에서 굴러갈
   *    여지를 없앤 뒤에도 그대로였다. 즉 window.scrollTo 로는 되돌릴 수 없다 —
   *    실제로 넣어봤고 15~24ms 가 18ms 로 줄었을 뿐 사라지지 않았다.
   *    움직이는 것은 뷰포트 자체이므로, 그 반대로 «내용»을 옮겨 상쇄한다.
   *    (같은 화면의 진단 패널이 이 방법으로 혼자 제자리에 남아 있었다 — 그게 근거다.)
   *
   * 평소에는 transform 을 아예 걸지 않는다. transform 이 있는 요소는 그 안의
   * position: fixed 에 대해 컨테이닝 블록이 되므로, 필요 없을 때 남겨두지 않는다.
   */
  const onVvScroll = () => {
    const shell = shellEl.value
    const off = Math.round(vv.offsetTop)
    if (shell) {
      if (off) shell.style.transform = `translateY(${off}px)`
      else shell.style.removeProperty('transform')
    }
    schedule()
  }

  /*
   * 포커스가 «들어오는 순간» 스크롤 여지를 미리 만든다.
   *
   * visualViewport.resize 는 WebKit 이 캐럿을 올린 «다음»에 온다. 위의 줄이기만으로는
   *   끌어내림 → (resize) → 되돌림
   * 순서가 되어 한 번 크게 튕긴다 (실제로 「끝까지 내려갔다 돌아온다」는 보고를 받았다).
   * 여지가 미리 있으면 WebKit 이 문서를 끌어내릴 이유가 없어 튕김 자체가 생기지 않는다.
   */
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as HTMLElement | null
    if (!t || !isTyping(t)) return
    const s = scrollerOf(t)
    if (!s || s === padded) return
    /*
     * 🔴 여지가 이미 있으면 손대지 않는다 — 이 한 줄이 두 가지를 동시에 막는다.
     *
     *    (1) 기기 판별이 필요 없다. pointer: coarse 로 가르면 트랙패드 붙인 아이패드처럼
     *        «coarse 가 아닌데 가상 키보드가 뜨는» 조합에서 조용히 꺼진다.
     *    (2) 키보드가 «이미» 올라와 있는 상태의 포커스 이동(타이틀 → 요약)에서 다시
     *        여백을 만드는 것을 막는다. 그때는 셸이 이미 줄어 스크롤러가 진짜 여지를
     *        갖고 있는데, 거기에 또 빈 여백을 얹으면 WebKit 의 캐럿 맞추기가 그 «빈 곳»
     *        까지 굴러들어가 폼이 화면 밖으로 사라졌다가 되돌아온다.
     *        화면 녹화에서 실제로 그 왕복이 찍혔다.
     *
     *    기준을 스크롤러 «자신의» 보이는 높이로 잡는 이유는, 그것이 곧 셸 높이이고
     *    셸은 이미 시각 뷰포트를 따라가기 때문이다 — 뷰포트를 따로 물어볼 필요가 없다.
     */
    if (s.scrollHeight - s.clientHeight >= s.clientHeight * 0.5) return
    release()
    padded = s
    s.style.paddingBottom = RESERVE
    // 하드웨어 키보드처럼 끝내 안 올라오는 경우 — 빈 여백이 남지 않게 되돌린다
    if (settle) clearTimeout(settle)
    settle = setTimeout(() => { if (vv.height >= window.innerHeight - 1) release() }, 600)
  }

  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', onVvScroll)
  document.addEventListener('focusin', onFocusIn)

  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
    if (settle) clearTimeout(settle)
    shellEl.value?.style.removeProperty('transform')
    release()
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', onVvScroll)
    document.removeEventListener('focusin', onFocusIn)
    root.style.removeProperty('--vvh')
  })
})
</script>

<template>
  <div ref="shellEl" class="shell">
    <EditorGate v-if="!loggedIn" />
    <slot v-else />
    <UpdateBanner />
    <!-- 확인창 한 벌. 라우트가 바뀌어도 살아 있어야 한다 (나가기 확인이 여기서 뜬다) -->
    <ConfirmDialog />
    <!--
      키보드 진단. import.meta.dev 는 «개발 서버로 띄운 문서»에서만 참이므로,
      로컬을 보는 dev 껍데기에서만 뜨고 운영 번들에는 아예 실려 나가지 않는다.
    -->
    <KeyboardProbe v-if="dev" />
  </div>
</template>

<style scoped>
/*
 * 셸은 뷰포트에 고정된다 — 문서는 스크롤하지 않는다.
 *
 * 모든 화면이 [헤더 | 본문 | 푸터] 세 칸이고 «본문만» 굴러간다. 문서가 통째로
 * 스크롤되면 헤더가 밀려 올라가 어느 화면인지·무엇을 편집 중인지가 사라지고,
 * 지도가 있는 화면에서는 지도까지 같이 밀린다.
 *
 * 그래서 쓰는 쪽 규칙은 하나다: .page 는 flex: 1 + min-height: 0 + overflow: hidden,
 * 그 안에서 본문에 해당하는 한 칸만 overflow-y: auto 를 갖는다.
 * position: fixed 를 쓰는 것은 BottomCta 하나뿐이다 (엄지가 닿아야 하는 주 액션).
 */
.shell {
  /* --vvh 는 위 스크립트가 키보드 높이를 빼고 넣는다. 없을 때(SSR·구형)는 100dvh 그대로다. */
  height: var(--vvh, 100dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--s1);
}
</style>
