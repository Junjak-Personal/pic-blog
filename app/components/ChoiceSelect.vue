<script setup lang="ts" generic="T extends string | number">
/**
 * 값 고르개 — 기본정보의 일차 경계 시각 · 공백 기준.
 *
 * CurrencySelect 와 같은 Reka Select 구조이고 목록 스타일도 같은 것을 쓴다
 * (assets/css/menu.css 의 .cur-* — SelectPortal 이 내용을 body 로 옮겨 scoped 가 닿지 않는다).
 * 네이티브 <select> 를 쓰지 않는 이유도 같다: 앱에서 열리는 것은 전부 Reka 로 그린다.
 *
 * 🔴 SelectRoot 는 프래그먼트라 DOM 이 없다 — 폭·높이는 트리거 «버튼»이 갖는다.
 */
import {
  SelectContent, SelectItem, SelectItemIndicator, SelectItemText,
  SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport,
} from 'reka-ui'

defineProps<{
  label: string
  options: readonly { value: T; text: string }[]
  disabled?: boolean
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <SelectRoot v-model="model" :disabled="disabled">
    <SelectTrigger class="choice-trigger field-control mono" :aria-label="label">
      <SelectValue class="choice-value" />
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6l6 -6" /></svg>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent class="cur-content popover-surface" position="popper" :side-offset="6" :collision-padding="12">
        <SelectViewport class="cur-viewport">
          <SelectItem
            v-for="o in options"
            :key="o.value"
            class="cur-item"
            :value="o.value"
          >
            <!-- 🔴 자리는 감싼 span 이 늘 잡는다 — 안 그러면 고를 때마다 글자가 밀린다 (CurrencySelect 와 같다) -->
            <span class="cur-check">
              <SelectItemIndicator>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5l10 -10" /></svg>
              </SelectItemIndicator>
            </span>
            <SelectItemText class="mono">{{ o.text }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
/* CurrencySelect 의 트리거와 같은 모양 · 같은 높이 토큰 */
.choice-trigger {
  /* 「120분 ⌄」 · 「08:30 ⌄」 가 잘리지 않는 폭 — 글자 단위로 둔다 */
  min-width: 10ch;
  min-height: var(--field-h-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 8px 0 10px;
  font-size: var(--fs-sm);
  color: var(--ink);
  cursor: pointer;
}
.choice-trigger[data-disabled] { opacity: 0.45; cursor: default; }
.choice-trigger svg { flex: none; color: var(--deep); }
.choice-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 900px) {
  /* 헤더 밖 조작 요소는 44px 이상(터치 타깃) — --field-h-sm(40px)은 모자라 --field-h(48px)를 쓴다 */
  .choice-trigger { min-height: var(--field-h); font-size: var(--fs-md); }
}
</style>
