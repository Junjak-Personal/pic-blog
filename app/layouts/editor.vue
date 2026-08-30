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


/**
 * 키보드가 올라온 만큼 셸을 줄인다 (--vvh).
 *
 * 가상 키보드는 «레이아웃» 뷰포트를 건드리지 않는 것이 표준 동작이라 100dvh 는 키보드가
 * 떠도 화면 전체 높이 그대로다. 이 셸은 문서를 스크롤하지 않는 구조라 내용이 뷰포트에
 * 딱 맞고, 편집 1단계는 문서도 안쪽 스크롤러도 스크롤 여지가 0 이었다. 그 상태에서 캐럿을
 * 올리려면 쓸 수 있는 상자가 없어 화면이 통째로 비는 사고가 났다 — 그게 이 코드의 이유다.
 *
 * 🔴 여기까지가 «검증된» 몫이다. 그 위에 얹었던 것들(포커스 시 여백 선점, 문서 되돌리기,
 *    시각 뷰포트 상쇄)은 기기 로그로 전부 기각됐다:
 *
 *      focusIN   vv=397+0     sy=0     sc=0/744/280  summary@268
 *      SCROLL    vv=397+-396  sy=-396  sc=0/744/280  summary@664   ← ~100ms 뒤 밀림
 *      SCROLL    vv=397+0     sy=0     sc=0/744/280  summary@268   ← ~17ms 뒤 복귀
 *
 *    안쪽 스크롤러는 내내 scrollTop 0 이다.
 *
 * 🔴 그런데 «되돌리기»는 반드시 있어야 한다. 한때 이것을 「24ms 가 18ms 로 줄었을 뿐」
 *    이라고 잘못 읽고 걷어냈는데, 그러자 로그가 이렇게 끝났다:
 *
 *      focusIN   vv=397+0     sy=0     summary@268
 *      SCROLL    vv=397+-396  sy=-396  summary@664   ← 그리고 «돌아오지 않는다»
 *
 *    앞선 로그들에서 ~17ms 뒤에 제자리로 돌아온 것은 WebKit 이 스스로 푼 것이 아니라
 *    바로 이 scrollTo 가 한 일이었다. 없으면 밀린 채로 남아 화면이 통째로 비고 하단
 *    CTA 가 사라진다 — 처음 신고된 그 증상이다.
 *
 *    되돌리는 일은 높이 계산과 무관하므로 rAF 를 거치지 않는다. 남는 흔들림은 한두
 *    프레임이고, 그 이상은 JS 로 못 줄인다 (상쇄를 걸어봤더니 합성 프레임이 어긋나
 *    반대 방향 흔들림만 하나 더 생겼다 — 로그의 @-128).
 */
onMounted(() => {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let raf = 0

  /**
   * 문서가 굴러가는 화면에서는 이 둘을 «하지 않는다» (useDocScroll).
   * 그쪽에서는 WebKit 이 문서를 정상으로 굴려 캐럿을 올리므로 셸을 줄일 이유가 없고,
   * 되돌리기는 그 «정상 스크롤»을 도로 0 으로 밀어 캐럿 맞추기를 망가뜨린다.
   */
  const docScroll = () => root.classList.contains('doc-scroll')

  const apply = () => {
    raf = 0
    if (docScroll()) root.style.removeProperty('--vvh')
    else root.style.setProperty('--vvh', `${vv.height}px`)
  }
  // 키보드는 여러 프레임에 걸쳐 올라온다 — 프레임마다 한 번만 쓴다
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply) }

  /** WebKit 이 밀어둔 것을 곧바로 되돌린다 — 위 🔴 참고. 이게 없으면 밀린 채로 남는다. */
  const undoPush = () => {
    if (docScroll()) return
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
  }

  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', undoPush)

  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', undoPush)
    root.style.removeProperty('--vvh')
  })
})

</script>

<template>
  <div class="shell">
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
