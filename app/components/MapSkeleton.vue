<script setup lang="ts">
/**
 * 지도 자리표시.
 *
 * Mapbox 는 onMounted 에서야 부팅한다 — SSR HTML 과 하이드레이션이 끝나기 전까지
 * 컨테이너는 «빈 칸»이다. 지도가 화면의 절반을 차지하는 화면들이라 그 사이가 그대로 구멍처럼
 * 보였다. useMapbox 의 status 초기값이 'loading' 이라 이 판은 서버 HTML 에 그대로 실린다.
 *
 * 격자와 선은 「지도가 올 자리」라는 신호일 뿐 실제 데이터가 아니다 — 좌표를 흉내 내지 않는다.
 */
</script>

<template>
  <div class="mapsk" role="status" aria-label="지도를 불러오는 중">
    <div class="grid" />
    <svg class="trace" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M14 78 C 52 70, 60 34, 96 40 S 150 26, 188 18" />
    </svg>
    <span class="mono label">
      <span class="spin sm" />
      지도를 불러오는 중
    </span>
  </div>
</template>

<style scoped>
.mapsk {
  position: absolute;
  inset: 0;
  z-index: 5;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--s1);
}

/* 지도 타일 격자를 암시하는 결. 눈에 겨우 걸릴 정도만 남긴다. */
.grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgb(var(--mid-rgb) / 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgb(var(--mid-rgb) / 0.05) 1px, transparent 1px);
  background-size: 56px 56px;
  /* .sk 와 같은 훑기를 격자 위에 얹는다 */
  mask-image: linear-gradient(90deg, transparent, #000 40%, #000 60%, transparent);
  mask-size: 200% 100%;
  animation: sk-sweep 1.8s ease-in-out infinite;
}

.trace {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.5;
}
.trace path {
  fill: none;
  stroke: var(--route);
  stroke-width: 0.8;
  stroke-dasharray: 2 5;
  stroke-opacity: 0.35;
  vector-effect: non-scaling-stroke;
}

.label {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 13px;
  border-radius: 999px;
  background: rgb(var(--sheet-rgb) / 0.72);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--faint);
}
.spin.sm { width: 13px; height: 13px; border-width: 1.5px; }
</style>
