<script lang="ts">
/**
 * 폴백 한 줄. 지도를 쓰는 다섯 화면이 각자 이 모양으로 손수 맞춰 넘기고 있어서
 * 이름을 붙였다 — 모양이 바뀌면 다섯 군데가 «컴파일 에러»로 알려주는 게 낫다.
 */
export interface FallbackItem {
  /** 목록에 뜨는 번호. '01' 처럼 이미 다듬어진 문자열이거나 '+' 같은 표식이다. */
  num: string
  name: string
  lat: number
  lng: number
}
</script>

<script setup lang="ts">
import { formatCoord } from '#shared/utils/geo'
/** 아트보드 1c — 「지도를 불러올 수 없습니다 → 좌표 목록으로 대체」. */
const props = defineProps<{ items: FallbackItem[] }>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="fallback">
    <div class="head">
      <span class="title">지도를 불러올 수 없습니다</span>
      <button type="button" class="mono retry" @click="$emit('retry')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
        다시 시도
      </button>
    </div>
    <div class="sub mono">좌표 목록으로 대체</div>
    <ol class="scroll-y list">
      <li v-for="(pt, i) in props.items" :key="i">
        <span class="mono num">{{ pt.num }}</span>
        <span class="name">{{ pt.name }}</span>
        <span class="mono coord">{{ formatCoord(pt.lat, pt.lng) }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.fallback {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px;
  background: var(--s1);
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.title { font-size: 15px; color: var(--ink); }
.retry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid rgba(177, 199, 193, 0.2);
  border-radius: var(--radius);
  font-size: 10.5px;
  color: var(--mid);
  cursor: pointer;
}
.sub { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.list { flex: 1; margin: 0; padding: 0; list-style: none; }
.list li {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 11px;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid var(--hair-soft);
}
.num {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--mid);
  border: 1px solid rgba(146, 178, 169, 0.6);
}
.name { font-size: 14px; color: var(--mid); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.coord { font-size: 10.5px; color: var(--faint); }
</style>
