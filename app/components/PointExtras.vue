<script setup lang="ts">
/**
 * 포인트의 기타 정보 — 링크와 소비 금액 (공개 화면).
 *
 * 상세 시트가 같은 것을 두 자리에 그린다 (데스크탑 .side · 모바일 ⓘ 판). 두 벌을
 * 따로 두면 한쪽만 고치는 날이 온다 — 태그·본문이 이미 그렇게 두 번 적혀 있어서
 * 새로 늘리는 건 여기서 끊는다.
 */
import {
  formatMoney, isSafeUrl, linkLabel, totalsOf,
  type PointExpense, type PointLink,
} from '#shared/utils/extras'

const props = defineProps<{ links: PointLink[]; expenses: PointExpense[] }>()

/**
 * 🔴 그릴 때 한 번 더 거른다. 저장 경로가 http/https 만 받지만, 그 검증이 생기기
 *    전에 들어온 행이나 손으로 고친 DB 는 여기로도 온다 — 화면이 마지막 문이다.
 */
const safeLinks = computed(() => props.links.filter((l) => isSafeUrl(l.url)))

/** 합계는 화폐별로. 한 줄뿐이면 항목과 같은 값이라 그리지 않는다. */
const totals = computed(() => (props.expenses.length > 1 ? totalsOf(props.expenses) : []))
</script>

<template>
  <div v-if="safeLinks.length || props.expenses.length" class="extras">
    <ul v-if="safeLinks.length" class="links">
      <li v-for="(l, i) in safeLinks" :key="i">
        <!-- 새 탭으로 나간다. noopener 는 opener 를 통한 탭 탈취를 막는다 -->
        <a class="link" :href="l.url" target="_blank" rel="noopener noreferrer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
          <span class="ltext">{{ linkLabel(l) }}</span>
          <svg class="out" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" /><path d="M11 13l9 -9" /><path d="M15 4h5v5" /></svg>
        </a>
      </li>
    </ul>

    <div v-if="props.expenses.length" class="spend">
      <span class="mono slabel">소비한 금액</span>
      <ul class="items">
        <li v-for="(e, i) in props.expenses" :key="i" class="item">
          <span class="iname">{{ e.item || '품목 없음' }}</span>
          <span class="mono iamt">{{ formatMoney(e.amount, e.currency) }}</span>
        </li>
      </ul>
      <!-- 화폐가 섞여 있으면 섞어서 더하지 않는다 — 화폐마다 한 줄 (extras.ts totalsOf) -->
      <div v-if="totals.length" class="total">
        <span class="mono tlabel">합계</span>
        <span class="tvals">
          <span v-for="t in totals" :key="t.currency" class="mono tamt">{{ formatMoney(t.amount, t.currency) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.extras { display: flex; flex-direction: column; gap: 12px; }

/* margin·padding 을 직접 끈다 — base.css 에 ul 리셋이 없어서 40px 들여쓰기가 남는다 */
.links { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid rgb(var(--acc-rgb) / 0.28);
  border-radius: var(--radius);
  color: var(--mid);
  font-size: var(--fs-sm);
  text-decoration: none;
}
.link:hover { background: rgb(var(--acc-rgb) / 0.12); color: var(--ink); }
.ltext { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.out { flex: none; color: var(--faint); }

.spend {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 11px;
  border: 1px solid var(--hair);
  border-radius: var(--radius);
  background: rgb(var(--acc-rgb) / 0.04);
}
.slabel { font-size: var(--fs-micro); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.items { display: flex; flex-direction: column; gap: 5px; margin: 0; padding: 0; list-style: none; }
.item { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.iname { min-width: 0; font-size: var(--fs-sm); color: var(--mid); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iamt { flex: none; font-size: var(--fs-sm); color: var(--deep); }

.total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-top: 7px;
  border-top: 1px solid var(--hair);
}
.tlabel { font-size: var(--fs-2xs); color: var(--faint); }
/* 화폐가 여럿이면 세로로 쌓는다 — 한 줄에 이어 붙이면 두 금액이 한 값으로 읽힌다 */
.tvals { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.tamt { font-size: var(--fs-sm); color: var(--ink); font-weight: 600; }

@media (max-width: 900px) {
  /* 엄지로 누른다 */
  .link { min-height: 44px; font-size: var(--fs-md); }
  .iname, .iamt { font-size: var(--fs-md); }
}
</style>
