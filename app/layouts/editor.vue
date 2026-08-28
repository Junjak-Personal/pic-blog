<script setup lang="ts">
import UpdateBanner from '~/components/UpdateBanner.vue'
import ConfirmDialog from '~/components/ConfirmDialog.vue'
/**
 * 쓰기 전체가 이 레이아웃 아래에 있다. 진입 조건이 비밀번호다 (설계문서 §7).
 * 라우트 단위가 아니라 레이아웃 단위 게이트 — 세션이 없으면 어떤 페이지든 비밀번호 화면으로 떨어진다.
 */
const { loggedIn } = useUserSession()
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
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--s1);
}
</style>
