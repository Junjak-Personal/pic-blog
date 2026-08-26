<script setup lang="ts">
/**
 * 아이콘 하나로 접히는 부가 동작 메뉴 (Reka UI headless).
 *
 * 모바일에서 상단바·행 액션을 전부 펼쳐두면 390px 한 줄에 안 들어가 겹치거나
 * 세로로 두세 줄을 먹는다. 주 동작 하나만 남기고 나머지는 여기로 접는다.
 *
 * 표시 분기를 컴포넌트가 직접 갖는다 — DropdownMenuRoot 가 렌더리스라
 * 밖에서 준 class 가 루트 엘리먼트에 안 붙고 그대로 버려진다. 쓰는 쪽은
 * 펼친 버튼에 .wide-only 만 붙이면 된다.
 *
 * 항목 스타일은 assets/css/menu.css 에 있다 — DropdownMenuPortal 이 내용을
 * body 로 옮기므로 scoped 스타일이 닿지 않는다.
 */
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'

withDefaults(defineProps<{ label?: string; align?: 'start' | 'center' | 'end' }>(), {
  label: '더 보기',
  align: 'end',
})
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger :aria-label="label" class="ovf-trigger" data-testid="overflow-menu-trigger">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
      </svg>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="ovf-content" :align="align" :side-offset="8" :collision-padding="12">
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
/* 아이콘 전용이라 테두리를 두르지 않는다 — 아이콘 하나를 상자에 가두면 어색하다.
   배경은 눌렀을 때·열렸을 때만 뜬다 (버튼 규칙의 icon-only ghost 예외). */
.ovf-trigger {
  /* 데스크탑에는 펼친 버튼이 따로 있다 — 900px 이하에서만 나타난다 */
  display: none;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--mid);
  cursor: pointer;
}
.ovf-trigger:active { background: rgba(146, 178, 169, 0.14); color: var(--ink); }
.ovf-trigger:focus-visible { box-shadow: var(--focus-ring); border-color: var(--focus-border); }
.ovf-trigger[data-state='open'] { background: rgba(146, 178, 169, 0.12); color: var(--ink); }

@media (max-width: 900px) {
  .ovf-trigger { display: grid; }
}
</style>
