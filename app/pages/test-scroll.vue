<script setup lang="ts">
/**
 * 키보드 실험대 — 개발 전용. 확인이 끝나면 진단과 함께 지운다.
 *
 * 묻는 것 하나: 문서가 «정상으로» 굴러가면 아이폰이 시각 뷰포트를 밀지 않는가?
 *
 * 지금 편집 화면은 뷰포트 고정 셸이라 문서가 굴러갈 여지가 없다. 그 상태에서 키보드가
 * 올라온 뒤 포커스를 옮기면 WebKit 이 시각 뷰포트를 -396(키보드 높이) 밀었다가
 * 우리가 되돌린다. 그 한두 프레임이 「스크롤이 이상하게 이동하는 느낌」이다.
 * (되돌리기를 빼면 밀린 채로 남아 화면이 통째로 빈다 — 그건 이미 확인했다.)
 *
 * 두 모드를 «같은 페이지»에서 번갈아 재고, 진단이 묶음마다 모드를 라벨에 실어 보낸다.
 */
definePageMeta({ layout: false })

if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

useHead({ title: '키보드 실험대' })

type Mode = 'fixed' | 'flow'

/*
 * 🔴 모드를 «주소»에 둔다. 진단이 묶음마다 route.fullPath 를 라벨로 싣기 때문에,
 *    이렇게 해야 로그만 보고 어느 모드에서 잰 것인지 가릴 수 있다.
 */
const router = useRouter()
const route = useRoute()
const mode = computed<Mode>(() => (route.query.mode === 'flow' ? 'flow' : 'fixed'))
function pick(m: Mode) {
  void router.replace({ query: { mode: m } })
}

const a = ref('')
const b = ref('')

/*
 * flow 모드에서는 문서가 실제로 굴러야 실험이 성립한다.
 * base.css 가 html/body 에 height:100% + overflow:hidden 을 걸어 두었으므로 여기서 연다.
 */
function syncFlow() {
  document.documentElement.classList.toggle('ts-flow', mode.value === 'flow')
}
// 🔴 마운트에서도 한 번 — 주소로 «바로» flow 로 들어오면 watch 는 울리지 않는다
watch(mode, syncFlow)
onMounted(syncFlow)
onBeforeUnmount(() => document.documentElement.classList.remove('ts-flow'))

/*
 * fixed 모드는 «진짜 편집 화면과 같아야» 의미가 있다 — layouts/editor.vue 가 하는 두 가지를
 * 그대로 한다: 셸 높이를 시각 뷰포트에 묶고, WebKit 이 민 것을 되돌린다.
 * flow 모드에서는 둘 다 하지 않는다 (문서가 굴러가므로 셸을 줄일 이유가 없다).
 */
onMounted(() => {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let raf = 0
  const apply = () => {
    raf = 0
    if (mode.value === 'fixed') root.style.setProperty('--vvh', `${vv.height}px`)
    else root.style.removeProperty('--vvh')
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(apply) }
  const undoPush = () => {
    if (mode.value !== 'fixed') return
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
  }
  apply()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', undoPush)
  watch(mode, apply)
  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', undoPush)
    root.style.removeProperty('--vvh')
  })
})
</script>

<template>
  <div class="ts" :class="mode">
    <div class="bar">
      <NuxtLink to="/" class="back mono">← 홈</NuxtLink>
      <button type="button" class="pick mono" :class="{ on: mode === 'fixed' }" @click="pick('fixed')">
        ① 지금 구조
      </button>
      <button type="button" class="pick mono" :class="{ on: mode === 'flow' }" @click="pick('flow')">
        ② A안
      </button>
    </div>

    <div class="body">
      <p class="mono note">
        <b>{{ mode === 'fixed' ? '① 지금 구조 — 고정 셸' : '② A안 — 문서 스크롤' }}</b><br>
        {{ mode === 'fixed'
          ? '셸이 뷰포트에 고정되고 이 칸만 굴러간다. 편집 화면과 같다.'
          : '문서가 통째로 굴러간다. 위 버튼줄도 같이 밀려 올라간다.' }}
      </p>

      <label class="f">
        <span class="mono lab">타이틀</span>
        <input v-model="a" data-testid="settings-title-input" class="in" placeholder="① 여기를 먼저">
      </label>
      <label class="f">
        <span class="mono lab">요약</span>
        <input v-model="b" data-testid="settings-summary-input" class="in" placeholder="② 그 다음 여기">
      </label>

      <!-- 문서가 굴러갈 길이를 만든다 — 짧으면 flow 모드가 사실상 고정과 같아진다 -->
      <p v-for="i in 16" :key="i" class="mono filler">채움 {{ i }}</p>
    </div>

    <KeyboardProbe />
  </div>
</template>


<style>
/* 🔴 전역이어야 한다 — 여는 대상이 html/body 다 (base.css 가 닫아 두었다) */
html.ts-flow, html.ts-flow body, html.ts-flow #__nuxt { height: auto; overflow: visible; }
</style>

<style scoped>
/* ① 지금 구조 — 편집 셸과 같은 모양 */
.ts.fixed {
  height: var(--vvh, 100dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--s0);
}
.ts.fixed .body { flex: 1; min-height: 0; overflow-y: auto; }

/* ② A안 — 아무것도 가두지 않는다 */
.ts.flow { min-height: 100dvh; background: var(--s0); }

.bar {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgb(var(--mid-rgb) / 0.2);
  background: var(--s0);
}
.back {
  display: flex;
  align-items: center;
  padding: 0 10px;
  min-height: 42px;
  border: 1px solid rgb(var(--mid-rgb) / 0.24);
  border-radius: var(--radius);
  color: var(--mid);
  font-size: var(--fs-2xs);
}
.pick {
  flex: 1;
  min-height: 42px;
  border: 1px solid rgb(var(--mid-rgb) / 0.24);
  border-radius: var(--radius);
  background: none;
  color: var(--mid);
  font-size: var(--fs-xs);
}
.pick.on { background: rgb(var(--acc-rgb) / 0.18); border-color: var(--acc); color: var(--ink); }

.body { display: flex; flex-direction: column; gap: 14px; padding: 150px 14px 60px; }
.note { font-size: var(--fs-2xs); color: var(--faint); line-height: 1.7; }
.note b { color: var(--ink); }
.f { display: flex; flex-direction: column; gap: 6px; }
.lab { font-size: var(--fs-micro); color: var(--faint); }
.in {
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid rgb(var(--mid-rgb) / 0.26);
  border-radius: var(--radius);
  background: var(--s1);
  color: var(--ink);
  font-size: var(--fs-xl);
}
.filler { font-size: var(--fs-2xs); color: var(--deep); padding: 12px 0; border-bottom: 1px dashed rgb(var(--mid-rgb) / 0.12); }
</style>
