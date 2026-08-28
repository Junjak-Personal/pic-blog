<script setup lang="ts">
/**
 * 앱이 그리는 확인창. 편집 레이아웃에 한 벌만 놓고 askConfirm() 이 띄운다.
 * 모양은 「포인트 범위 변경」 다이얼로그(PostSettings)와 같은 것을 쓴다 —
 * 같은 무게의 질문이 화면마다 다르게 생기면 안 된다.
 */
import {
  AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle,
} from 'reka-ui'
import { settleConfirm, useConfirmState } from '~/composables/useConfirm'

const { pending, open } = useConfirmState()

/*
 * AlertDialog 는 바깥 클릭으로 닫히지 않는다 (그것이 Dialog 와 다른 점이고, 되돌릴 수
 * 없는 것을 묻는 자리에 맞다). 그래서 닫히는 길은 셋뿐이다 — 취소 · 확인 · Esc.
 * 셋 다 «자기 자리에서» settleConfirm 을 부른다.
 *
 * 🔴 open 은 v-model 이어야 한다. 취소·확인 버튼은 Reka 가 자기 기본 동작으로 먼저 닫는데,
 *    :open 만 단방향으로 묶으면 그 닫힘이 우리 ref 에 안 돌아와 상태가 갈린다.
 *    그리고 닫힘 자체는 «답»이 아니다 (이유는 useConfirm.ts 의 🔴 주석).
 */
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay class="ovl" />
      <!--
        마운트·언마운트는 Reka 에 맡긴다. 여기에 v-if 를 겹쳐 걸면 닫히는 도중
        콘텐츠가 먼저 사라져 포커스 복원·스크롤 잠금 해제가 어긋날 수 있다.
        값은 옵셔널로 읽는다.
      -->
      <AlertDialogContent class="dlg" @escape-key-down="settleConfirm(false)">
        <AlertDialogTitle class="dlg-title">{{ pending?.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="pending?.body" class="dlg-desc">
          {{ pending.body }}
        </AlertDialogDescription>

        <div class="dlg-actions">
          <AlertDialogCancel class="btn ghost mono" @click="settleConfirm(false)">
            {{ pending?.cancelLabel ?? '취소' }}
          </AlertDialogCancel>
          <AlertDialogAction
            class="btn mono"
            :class="pending?.danger ? 'danger' : 'primary'"
            @click="settleConfirm(true)"
          >
            {{ pending?.confirmLabel ?? '계속' }}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<style scoped>
/* PostSettings 의 다이얼로그와 같은 값 — 두 창이 나란히 뜨는 일은 없지만 같아야 한다 */
.ovl { position: fixed; inset: 0; z-index: 100; background: rgba(4, 4, 8, 0.72); backdrop-filter: blur(3px); }
.dlg {
  position: fixed;
  z-index: 101;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(460px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px;
  background: var(--s1);
  border: 1px solid rgba(146, 178, 169, 0.3);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
}
.dlg-title { font-size: 17px; letter-spacing: -0.01em; color: var(--ink); }
.dlg-desc { font-size: 13px; line-height: 1.7; color: var(--mid); }
.dlg-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 15px;
  border-radius: var(--radius);
  font-size: 12px;
  cursor: pointer;
}
.btn.ghost { border: 1px solid rgba(177, 199, 193, 0.2); color: var(--mid); }
.btn.primary { background: var(--mid); color: var(--s0); font-weight: 600; }
/* 밝은 빨강 위의 검정은 잘 안 읽힌다 — 면은 어둡게, 글자는 밝게 (tokens.css) */
.btn.danger { background: var(--danger-fill); color: var(--ink); font-weight: 600; }

@media (max-width: 900px) {
  /* 엄지로 누른다 — 두 버튼이 폭을 나눠 갖고 44px */
  .dlg-actions .btn { flex: 1; min-height: 44px; }
}
</style>
