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
 *    안쪽 스크롤러는 내내 scrollTop 0 이다. 움직이는 것은 문서가 아니라 시각 뷰포트
 *    자체라서 JS 가 손댈 수 없고, 상쇄를 걸어도 합성 프레임이 어긋나 반대 방향 흔들림만
 *    생겼다(로그의 @-128). 그래서 손대는 것을 그만두고 최소로 되돌린다 —
 *    WebKit 이 캐럿을 맞추는 동안 우리가 레이아웃을 건드리면 그 흔들림을 키울 뿐이다.
 */
onMounted(() => {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let raf = 0

  const apply = () => {
    raf = 0
    root.style.setProperty('--vvh', `${vv.height}px`)
  }
  // 키보드는 여러 프레임에 걸쳐 올라온다 — 프레임마다 한 번만 쓴다
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply) }

  apply()
  vv.addEventListener('resize', schedule)

  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
    vv.removeEventListener('resize', schedule)
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
