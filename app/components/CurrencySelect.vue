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
            <!--
              🔴 트리거에 뜨는 글자는 SelectItemText 의 내용이다. 줄의 화폐 칸이 좁아
                 「대만달러」가 안 들어가므로 코드를 여기 넣는다. 무엇인지는 목록에서
                 한글로 보면 된다 — 좁은 것은 줄이지 목록이 아니다.
            -->
            <SelectItemText class="mono cur-code">{{ c.code }}</SelectItemText>
            <span class="cur-name">{{ c.label }}</span>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
/* .input.mini 와 같은 값 — 같은 줄에 선 입력들과 높이·테두리가 어긋나면 안 된다 */
.curtrigger {
  /*
   * 폭은 «줄»이 정한다 (editor/[slug].vue 의 .xrow 비율 — 품목 45 · 금액 30 · 화폐 15).
   * min-width 는 「KRW ⌄」가 안 잘리는 최소값이다 — 비율만 두면 좁은 화면에서 코드가 잘린다.
   */
  flex: 15 1 0;
  /* 실측: 트리거 폭 - 글자 칸 = 45px (테두리 2 · 여백 18 · 화살표 12 · 간격 4 · 정렬 여유).
     mono 세 글자가 12px 에서 24px 이므로 70px 이면 잘리지 않는다. */
  min-width: 70px;
  /* 같은 줄의 입력들과 높이를 맞춘다. 여백·글꼴이 폭마다 달라져 min-height 로 맞추면
     모바일에서 6px 씩 어긋난다 — 줄 높이를 따라가게 두는 편이 어디서나 맞다. */
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
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
  /*
   * 16px 로 키우지 않는다. iOS 의 강제 확대는 «입력»에 초점이 갈 때 걸리는 것이고
   * 이건 button 이라 해당이 없다 (base.css 의 16px 규칙도 input/textarea/select 만 잡는다).
   * 그만큼 아낀 폭은 품목명 칸으로 간다 — 좁은 화면에서 거기가 제일 아쉽다.
   */
  .curtrigger { min-width: 74px; min-height: 44px; font-size: 13px; }
}
</style>
