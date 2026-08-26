<script setup lang="ts">
/**
 * pic·blog 마크 — 앱의 번호 마커 실루엣(둥근 몸통 + 꼬리)에 렌즈를 넣은 형태.
 * PWA 아이콘(public/icons/*.png)과 같은 도형이고, 그쪽은 canvas 로 렌더한 래스터다.
 *
 * 인라인 SVG 인 이유: 몸통이 currentColor 라 놓인 자리의 색을 물려받고,
 * 어떤 크기에서도 또렷하다. 아이콘 PNG 를 <img> 로 끌어다 쓰면 둘 다 잃는다.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 26 })
</script>

<template>
  <svg
    :width="size"
    :height="size * (26 / 24)"
    viewBox="0 0 24 26"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M7.4 0.6h9.2a6.8 6.8 0 0 1 6.8 6.8v4.4a6.8 6.8 0 0 1 -6.8 6.8h-1.4L12 24.9l-3.2 -6.3H7.4a6.8 6.8 0 0 1 -6.8 -6.8V7.4A6.8 6.8 0 0 1 7.4 0.6z"
      fill="currentColor"
    />
    <circle cx="12" cy="9.6" r="5.1" fill="var(--s0)" />
    <circle cx="14.2" cy="7.4" r="1.35" fill="var(--route)" />
  </svg>
</template>
