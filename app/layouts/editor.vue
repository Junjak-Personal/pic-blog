<script setup lang="ts">
import UpdateBanner from '~/components/UpdateBanner.vue'
import ConfirmDialog from '~/components/ConfirmDialog.vue'
/**
 * 쓰기 전체가 이 레이아웃 아래에 있다. 진입 조건이 비밀번호다 (설계문서 §7).
 * 라우트 단위가 아니라 레이아웃 단위 게이트 — 세션이 없으면 어떤 페이지든 비밀번호 화면으로 떨어진다.
 */
const { loggedIn } = useUserSession()

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
 */
onMounted(() => {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let raf = 0

  const apply = () => {
    raf = 0
    root.style.setProperty('--vvh', `${vv.height}px`)
    // 이미 끌려 올라간 뒤일 수 있다 — 문서를 제자리로 돌린다
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
  }
  // 키보드는 여러 프레임에 걸쳐 올라온다 — 프레임마다 한 번만 쓴다
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply) }

  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)

  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', schedule)
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
