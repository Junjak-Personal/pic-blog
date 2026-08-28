<script setup lang="ts">
/**
 * 동작(생성·수정·삭제) 중 화면을 막는 판.
 *
 * 스켈레톤과 반대 방향이다 — 스켈레톤은 «아직 없는 것»의 자리를 잡고, 이건 «이미 있는 것»을
 * 흐려서 지금 만지면 안 된다고 말한다. 저장이 도는 동안 사진 순서를 계속 끌 수 있으면
 * 서버로 나간 초안과 화면이 갈린다.
 *
 * 감싸는 요소에 position 이 있어야 한다 (inset: 0 기준).
 */
defineProps<{ label: string }>()
</script>

<template>
  <div class="busy" role="status" aria-live="polite">
    <div class="card">
      <span class="spin" />
      <span class="mono text">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.busy {
  position: absolute;
  inset: 0;
  /* 하단 CTA(z 60)·드롭다운(z 90) 사이. 동작 중에는 CTA 도 덮어야 한다. */
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgb(var(--s0-rgb) / 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  /* 흐림 뒤의 것을 누르지 못하게 — 판이 클릭을 전부 받아낸다 */
  cursor: progress;
}
.card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-radius: var(--radius-lg);
  background: rgb(var(--s1-rgb) / 0.92);
  border: 1px solid rgb(var(--acc-rgb) / 0.28);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
}
.text { font-size: var(--fs-sm); color: var(--mid); }
</style>
