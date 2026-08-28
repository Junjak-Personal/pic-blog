<script setup lang="ts">
/**
 * 모바일 하단 고정 액션 바 (≤900px 전용).
 *
 * 상단바에 있는 주 액션은 한 손으로 잡은 폰에서 엄지가 닿지 않는다 —
 * 특히 편집처럼 아래쪽(태그·본문)을 보다가 저장하는 흐름에서 매번 위로 올라가야 했다.
 * 주 액션 하나만 여기에 두고, 부가 동작은 상단 OverflowMenu 에 남긴다.
 *
 * 홈 인디케이터를 피하려고 safe-area 만큼 아래 여백을 준다.
 * 자리를 차지하지 않는 fixed 이므로, 쓰는 쪽 스크롤 컨테이너는
 * calc(var(--cta-h) + env(safe-area-inset-bottom)) 만큼 하단을 비운다.
 */
withDefaults(defineProps<{ note?: string | null }>(), { note: null })

/*
 * 실제 높이를 재서 --cta-h 에 넣는다.
 * fixed 라 문서 흐름에서 자리를 안 차지하므로, 아래 깔리는 내용은 이 값만큼 비워야 한다.
 * 노트 한 줄이 생기고 없어지면서 높이가 바뀌므로(67↔84px) 상수로 박으면 어긋난다 —
 * 실제로 하단이 잘렸다는 보고가 있었다.
 */
const el = useTemplateRef<HTMLElement>('cta')

onMounted(() => {
  if (!el.value) return
  const set = () => {
    const h = el.value?.offsetHeight
    if (h) document.documentElement.style.setProperty('--cta-h', `${h}px`)
  }
  set()
  const ro = new ResizeObserver(set)
  ro.observe(el.value)
  onBeforeUnmount(() => {
    ro.disconnect()
    document.documentElement.style.removeProperty('--cta-h')
  })
})
</script>

<template>
  <div ref="cta" class="cta">
    <p v-if="note" class="mono note">{{ note }}</p>
    <div class="row">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.cta { display: none; }

@media (max-width: 900px) {
  .cta {
    position: fixed;
    z-index: 60;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* 위를 더 띄운다 — 10px 이면 바로 위 내용과 붙어 판이 «잘린 것»처럼 보였다.
       이 값을 바꾸면 --cta-h(menu.css)도 같이 바꿔야 한다. 아래 내용이 그만큼 비켜선다. */
    padding: 16px 14px calc(12px + env(safe-area-inset-bottom));
    background: rgb(var(--s0-rgb) / 0.94);
    backdrop-filter: blur(14px);
    border-top: 1px solid rgb(var(--acc-rgb) / 0.22);
  }
  .note { font-size: var(--fs-2xs); color: var(--faint); text-align: center; }
  .row { display: flex; align-items: center; gap: 8px; }
  /* 슬롯에 들어오는 버튼·링크는 폭을 나눠 갖고 44px 터치 타깃을 갖는다 */
  .row :deep(> *) {
    flex: 1;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: var(--radius);
    /*
     * 🔴 여기가 CTA 글자 크기의 SSOT 다. .btn 은 base.css 의 전역(0,1,0)이고 이 규칙은
     *    (0,2,0)이라 여기가 이긴다 — 화면마다 따로 올리지 않는다.
     *    11px 은 헤더·툴바용 크기다. 그대로 두면 상자만 크고 글자가 작아 보인다
     *    (편집 화면이 그래서 혼자 15px 로 올려 쓰고 있었다). 하단 CTA 는 그 화면에서
     *    가장 큰 버튼이므로 셋 다 같은 크기로 간다.
     */
    font-size: var(--fs-xl);
  }
}
</style>
