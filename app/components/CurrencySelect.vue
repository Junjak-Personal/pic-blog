<script setup lang="ts">
/**
 * 화폐 고르개 — 편집 3단계 「소비한 금액」.
 *
 * 네이티브 <select> 를 쓰지 않는다. 앱에서 열리는 것은 전부 Reka 로 그린다
 * (부가 메뉴 · 확인창). 여기만 OS 가 그리면 그 자리만 남남이 되고, 다크 배경에
 * 맞추려고 color-scheme 같은 우회를 하나 더 얹어야 한다.
 *
 * 🔴 SelectRoot 는 프래그먼트라 DOM 이 없다 — 밖에서 준 class 가 붙을 자리가 없다
 *    (OverflowMenu 가 DropdownMenuRoot 로 똑같이 겪었다). 그래서 폭·높이를 이 컴포넌트가
 *    직접 갖는다: .xrow 의 플렉스 아이템이 되는 것은 트리거 «버튼»이다.
 *
 * 목록 스타일은 assets/css/menu.css 에 있다 — SelectPortal 이 내용을 body 로 옮기므로
 * scoped 스타일이 닿지 않는다 (같은 이유로 .ovf-content 도 거기 있다).
 */
import {
  SelectContent, SelectItem, SelectItemIndicator, SelectItemText,
  SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport,
} from 'reka-ui'
import { CURRENCIES, type CurrencyCode } from '#shared/utils/extras'

defineProps<{ label: string }>()

const model = defineModel<CurrencyCode>({ required: true })
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger class="curtrigger mono" :aria-label="label">
      <SelectValue class="curvalue" />
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6l6 -6" /></svg>
    </SelectTrigger>

    <SelectPortal>
      <!--
        popper — 기본값(item-aligned)은 고른 항목을 트리거 «위»에 겹쳐 띄우는 맥OS 방식이라
        좁은 편집 칸에서 목록이 화면 밖으로 밀린다. 부가 메뉴와 같은 방식으로 통일한다.
      -->
      <SelectContent class="cur-content" position="popper" :side-offset="6" :collision-padding="12">
        <SelectViewport class="cur-viewport">
          <SelectItem
            v-for="c in CURRENCIES"
            :key="c.code"
            class="cur-item"
            :value="c.code"
          >
            <!-- 🔴 Indicator 는 고른 항목에만 그려진다. 자리를 늘 잡는 건 감싼 span 이다 —
                 안 그러면 고를 때마다 글자가 16px 씩 밀린다. -->
            <span class="cur-check">
              <SelectItemIndicator>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5l10 -10" /></svg>
              </SelectItemIndicator>
            </span>
            <SelectItemText>{{ c.label }}</SelectItemText>
            <span class="mono cur-code">{{ c.code }}</span>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
/* .input.mini 와 같은 값 — 같은 줄에 선 입력들과 높이·테두리가 어긋나면 안 된다 */
.curtrigger {
  flex: 0 0 84px;
  /* 같은 줄의 입력들과 높이를 맞춘다. 여백·글꼴이 폭마다 달라져 min-height 로 맞추면
     모바일에서 6px 씩 어긋난다 — 줄 높이를 따라가게 두는 편이 어디서나 맞다. */
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-width: 0;
  min-height: 31px;
  padding: 7px 8px 7px 10px;
  background: var(--field);
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--ink);
  cursor: pointer;
}
.curtrigger:hover { border-color: rgba(146, 178, 169, 0.34); }
.curtrigger:focus-visible { border-color: var(--focus-border); box-shadow: var(--focus-ring); outline: none; }
.curtrigger[data-state='open'] { border-color: var(--focus-border); }
.curtrigger svg { flex: none; color: var(--deep); }
.curvalue { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 900px) {
  /* 입력이 16px 로 커지는 폭이다 (base.css) — 트리거도 같이 커야 줄이 어긋나지 않는다 */
  .curtrigger { flex: 1 1 104px; min-height: 44px; font-size: 16px; }
}
</style>
