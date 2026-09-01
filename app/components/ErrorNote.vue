<script setup lang="ts">
/**
 * 닫을 수 있는 오류 한 줄.
 *
 * 예전에는 각 화면이 `<p v-if="errorMessage">` 를 직접 그렸고 닫는 길이 없었다. 그래서
 * 한 번 뜬 문구가 다음 동작 때까지 계속 남았다 — 「좌표 없는 사진」처럼 이미 읽고 넘어간
 * 안내가 화면 한 줄을 계속 차지했다.
 *
 * 문구가 없으면 아무것도 그리지 않으므로 자리도 차지하지 않는다.
 * 겉모습(크기·자리)은 쓰는 쪽이 class 로 준다 — 컴포넌트 루트에는 부모의 스코프가
 * 함께 붙으므로 기존 `.err` · `.error` 규칙이 그대로 닿는다.
 */
defineProps<{ message: string | null }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <p v-if="message" class="note mono" role="status">
    <span class="msg">{{ message }}</span>
    <button type="button" class="x" aria-label="이 안내 닫기" @click="emit('close')">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
    </button>
  </p>
</template>

<style scoped>
.note {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  color: var(--danger);
}
/* 긴 문구는 잘린다 — 자르는 것은 «글자»여야 한다. 판 전체에 걸면 닫기 버튼까지 잘린다. */
.msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  opacity: 0.75;
  cursor: pointer;
}
.x:hover { opacity: 1; background: rgb(var(--danger-rgb) / 0.16); }

@media (max-width: 900px) {
  /* 보이는 크기는 그대로 두고 닿는 넓이만 넓힌다 (.kill 과 같은 처방) */
  .x { position: relative; }
  .x::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
}
</style>
