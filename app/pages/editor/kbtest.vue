<script setup lang="ts">
/**
 * A안 실험대 — 개발 전용. 폰에서 «재보기» 위한 것이고 확인이 끝나면 지운다.
 *
 * 묻는 것 하나: 문서가 정상으로 굴러가면 아이폰이 시각 뷰포트를 밀지 않는가?
 * (지금 편집 화면은 뷰포트 고정 셸이라 굴러갈 여지가 없고, 그래서 키보드가 올라온 뒤
 *  포커스를 옮기면 WebKit 이 뷰포트를 -396 밀었다가 우리가 되돌린다 — 그 한두 프레임이
 *  「스크롤이 이상하게 이동하는 느낌」이다.)
 *
 * 진짜 편집 화면과 같은 조건에서 재야 하므로 editor 레이아웃을 그대로 쓴다 —
 * --vvh 도 되돌리기도 살아 있다. 바꾸는 것은 «문서가 굴러갈 수 있는가» 하나뿐이다.
 */
definePageMeta({ layout: 'editor' })

if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

const route = useRouter()
const q = useRoute()
const flow = computed(() => q.query.mode === 'flow')

/** flow 모드에서만 셸의 고정을 푼다 — 문서가 실제로 굴러가야 실험이 성립한다 */
watchEffect(() => {
  if (!import.meta.client) return
  document.documentElement.classList.toggle('kbtest-flow', flow.value)
})
onBeforeUnmount(() => document.documentElement.classList.remove('kbtest-flow'))

function go(mode: 'fixed' | 'flow') {
  void route.replace({ query: { mode } })
}
</script>

<template>
  <div class="page" :class="{ flow }">
    <div class="bar">
      <button type="button" class="btn mono" :class="{ on: !flow }" @click="go('fixed')">고정 셸 (지금)</button>
      <button type="button" class="btn mono" :class="{ on: flow }" @click="go('flow')">문서 스크롤 (A안)</button>
    </div>

    <div class="body" :class="{ scroller: !flow }">
      <p class="mono note">
        {{ flow ? 'A안 — 문서가 굴러간다. 헤더도 같이 밀려 올라간다.' : '지금 구조 — 셸이 고정이고 이 칸만 굴러간다.' }}
      </p>

      <label class="f"><span class="mono">타이틀</span>
        <input data-testid="settings-title-input" class="in" placeholder="여기를 먼저 누르세요"></label>
      <label class="f"><span class="mono">요약</span>
        <input data-testid="settings-summary-input" class="in" placeholder="그 다음 여기를 누르세요"></label>

      <!-- 문서가 굴러갈 만큼 길이를 준다 — 짧으면 flow 모드가 사실상 고정과 같아진다 -->
      <p v-for="i in 12" :key="i" class="mono filler">채움 {{ i }} — 문서 길이를 만든다</p>
    </div>
  </div>
</template>

<style>
/* 🔴 전역이어야 한다. 셸은 이 컴포넌트 «밖»(layouts/editor.vue)에 있다. */
html.kbtest-flow, html.kbtest-flow body, html.kbtest-flow #__nuxt {
  height: auto;
  overflow: visible;
}
html.kbtest-flow .shell { height: auto; min-height: 100dvh; overflow: visible; }
</style>

<style scoped>
.page { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.page.flow { min-height: auto; overflow: visible; }

.bar { flex: none; display: flex; gap: 8px; padding: 10px 12px; border-bottom: 1px solid rgb(var(--mid-rgb) / 0.2); }
.btn {
  flex: 1;
  min-height: 40px;
  border: 1px solid rgb(var(--mid-rgb) / 0.24);
  border-radius: var(--radius);
  background: none;
  color: var(--mid);
  font-size: var(--fs-xs);
}
.btn.on { background: rgb(var(--acc-rgb) / 0.18); border-color: var(--acc); color: var(--ink); }

.body { display: flex; flex-direction: column; gap: 14px; padding: 16px 14px 40px; }
.body.scroller { flex: 1; min-height: 0; overflow-y: auto; }

.note { font-size: var(--fs-2xs); color: var(--faint); line-height: 1.6; }
.f { display: flex; flex-direction: column; gap: 6px; }
.f .mono { font-size: var(--fs-micro); color: var(--faint); }
.in {
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid rgb(var(--mid-rgb) / 0.26);
  border-radius: var(--radius);
  background: var(--s1);
  color: var(--ink);
  font-size: var(--fs-xl);
}
.filler { font-size: var(--fs-2xs); color: var(--deep); padding: 10px 0; border-bottom: 1px dashed rgb(var(--mid-rgb) / 0.12); }
</style>
