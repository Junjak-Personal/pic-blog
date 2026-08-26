<script setup lang="ts">
/**
 * 새 배포가 있을 때 뜨는 줄. 스스로 새로고침하지 않는 이유는
 * useAppUpdate.ts 주석 참고 — 편집 중이면 초안이 날아간다.
 */
import { useAppUpdate } from '~/composables/useAppUpdate'

const { updateReady, apply } = useAppUpdate()
const dismissed = ref(false)
</script>

<template>
  <Transition name="rise">
    <div v-if="updateReady && !dismissed" class="upd" role="status">
      <span class="msg">새 버전이 있습니다</span>
      <button type="button" class="go mono" @click="apply">새로고침</button>
      <button type="button" class="x" aria-label="닫기" @click="dismissed = true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.upd {
  position: fixed;
  z-index: 70;
  left: 50%;
  transform: translateX(-50%);
  /* 하단 CTA 가 있는 화면에서는 그 위로 뜬다 (--cta-h 는 BottomCta 가 실측해 넣는다) */
  bottom: calc(14px + env(safe-area-inset-bottom) + var(--cta-h, 0px));
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100vw - 28px);
  padding: 9px 9px 9px 15px;
  background: rgba(11, 14, 18, 0.97);
  border: 1px solid rgba(146, 178, 169, 0.32);
  border-radius: 999px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}
.msg { font-size: 13px; color: var(--ink); white-space: nowrap; }
.go {
  flex: none;
  min-height: 32px;
  padding: 0 13px;
  border: 0;
  border-radius: 999px;
  background: var(--mid);
  color: var(--s0);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.x {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--faint);
  cursor: pointer;
}
.x:active { background: rgba(146, 178, 169, 0.14); }

.rise-enter-active, .rise-leave-active { transition: opacity 0.2s, transform 0.2s; }
.rise-enter-from, .rise-leave-to { opacity: 0; transform: translate(-50%, 10px); }
.rise-enter-to, .rise-leave-from { transform: translateX(-50%); }
</style>
