/**
 * 확인 다이얼로그 — window.confirm 대신.
 *
 * 네이티브 confirm 은 브라우저가 그리므로 앱과 아무 관계 없는 모양으로 뜬다.
 * 표준 대화상자 위에 URL 이 붙고, 줄바꿈·강조가 안 되고, iOS 에서는 화면 위쪽에
 * 시스템 시트로 떠서 「이 앱이 무언가를 묻는다」가 아니라 「브라우저가 끼어들었다」로
 * 읽힌다. 되돌릴 수 없는 삭제를 묻는 자리라 그 차이가 크다.
 *
 * 🔴 모듈 수준 ref 다. Nuxt 에서 모듈 상태는 서버 요청 사이에 공유되므로 보통은
 *    useState 를 쓰지만, 여기 담기는 값에는 resolve 함수가 들어 있어 직렬화가 안 된다.
 *    이 값은 «사용자 조작으로만» 채워지므로 서버에서는 언제나 null 이고, 그래서 안전하다.
 */
export interface ConfirmOptions {
  title: string
  body?: string
  /** 확인 버튼 문구. 무엇이 일어나는지를 적는다 — 「확인」은 아무 말도 아니다. */
  confirmLabel?: string
  cancelLabel?: string
  /** 되돌릴 수 없는 동작이면 true — 확인 버튼이 붉어진다 */
  danger?: boolean
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

const pending = ref<Pending | null>(null)
const open = ref(false)

/** ConfirmDialog 만 쓴다 */
export function useConfirmState() {
  return { pending, open }
}

/** 물어보고 답을 기다린다. 취소·Esc 는 false 다. */
export function askConfirm(options: ConfirmOptions) {
  return new Promise<boolean>((resolve) => {
    // 앞선 물음이 남아 있으면 취소로 닫는다 — 두 개가 겹쳐 뜨면 어느 쪽에 답하는지 모른다
    settleConfirm(false)
    pending.value = { ...options, resolve }
    open.value = true
  })
}

/**
 * 답을 확정하고 닫는다.
 *
 * 🔴 「열림」과 「답」을 한 값으로 묶으면 안 된다. AlertDialogAction 은 자기 클릭
 *    핸들러에서 다이얼로그를 «먼저» 닫는데, 그 닫힘이 곧 취소로 해석되면 우리 @click 이
 *    돌 때는 이미 false 로 확정된 뒤다 — 확인 버튼이 영영 안 먹는다.
 *    (PostSettings 의 반경 다이얼로그가 실제로 그렇게 실패했었다.)
 *    그래서 닫힘(update:open)은 답을 만들지 않고, 답은 버튼·Esc 가 직접 낸다.
 */
export function settleConfirm(ok: boolean) {
  const p = pending.value
  if (!p) return
  // 답은 즉시 낸다. 문구(pending)는 남겨둔다 — 닫히는 동안 제목이 빈칸으로 깜빡이면
  // 안 되고, 다음 askConfirm 이 어차피 통째로 덮어쓴다.
  pending.value = { ...p, resolve: () => {} }
  open.value = false
  p.resolve(ok)
}
