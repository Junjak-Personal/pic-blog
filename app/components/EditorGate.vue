<script setup lang="ts">
/** 아트보드 1e — 비밀번호 화면. 읽기 경로는 이 화면을 절대 만나지 않는다. */
const { fetch: refreshSession } = useUserSession()

const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  if (busy.value) return
  // 빈 값이면 버튼을 잠그는 대신 여기서 이유를 말한다 — 비활성 버튼은 왜 안 눌리는지
  // 아무 신호도 주지 않고, 스크린리더·암호 관리자·자동화가 전부 막힌다.
  if (!password.value) {
    error.value = '비밀번호를 입력하세요'
    return
  }
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } })
    await refreshSession()
    password.value = ''
  } catch (e) {
    error.value = e instanceof Error && 'statusMessage' in e && typeof e.statusMessage === 'string'
      ? e.statusMessage
      : '비밀번호가 맞지 않습니다'
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="gate">
    <!--
      method="post" 가 필수다. action 이 없는 form 은 기본이 GET 이라,
      하이드레이션 전에 제출되면(느린 회선·JS 실패·자동화) 브라우저가
      현재 URL 로 GET 을 날리면서 ?password=... 로 평문을 URL 에 싣는다.
      그러면 브라우저 기록과 서버·CDN 접근 로그에 비밀번호가 남는다.
      @submit.prevent 는 하이드레이션 이후에만 유효하므로 그것만 믿을 수 없다.
    -->
    <form class="card" method="post" @submit.prevent="submit">
      <header>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>
        <span>{{ error ? '비밀번호가 맞지 않습니다' : '편집 잠금' }}</span>
      </header>

      <div class="body">
        <div class="intro">
          <h3>비밀번호를 입력하세요</h3>
          <p>읽기는 링크만으로 가능하고, 편집은 이 기기에서 비밀번호를 한 번 확인합니다.</p>
        </div>

        <!--
          사용자 이름 칸이 없는 비밀번호 전용 폼은 암호 관리자가 자격증명을 어디에
          묶어야 할지 몰라 저장·자동입력이 불안정하다 (iOS 키체인 포함).
          계정 개념이 없는 서비스라 값은 고정이고, 화면에서는 감춘다.
        -->
        <input
          class="sr-only"
          type="text"
          name="username"
          value="editor"
          autocomplete="username"
          tabindex="-1"
          aria-hidden="true"
        >

        <label class="field" :class="{ bad: !!error }">
          <input
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            :disabled="busy"
            aria-label="편집 비밀번호"
          >
        </label>

        <p class="note mono">비밀번호는 서버 환경변수에 있습니다 — 재발급은 배포로만.</p>

        <!-- 오른쪽 정렬 · 가장 오른쪽이 주 동작. 순서를 바꿔야 하는 자리라 마크업을 뒤집는다 -->
        <div class="actions">
          <NuxtLink to="/" class="ghost mono">읽기로 돌아가기</NuxtLink>
          <button type="submit" class="primary mono" :disabled="busy">
            {{ busy ? '확인 중…' : '편집 시작' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.gate {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px;
  /* 셸이 overflow: hidden 이라 문서 스크롤이 없다 — 짧은 화면(가로 모드 등)에서
     내용이 넘치면 여기서 굴러야 잘리지 않는다 */
  overflow-y: auto;
}

.card {
  width: min(640px, 100%);
  background: var(--s1);
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

header {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-bottom: 1px solid var(--hair);
  color: var(--mid);
  font-size: var(--fs-lg);
}
header svg { display: block; flex: none; }

.body { display: flex; flex-direction: column; gap: 16px; padding: 32px 40px 36px; }

.intro { display: flex; flex-direction: column; gap: 8px; }
h3 { font-size: var(--fs-display); letter-spacing: -0.02em; color: var(--ink); }
.intro p { max-width: 420px; font-size: var(--fs-md); line-height: 1.65; color: var(--mid); opacity: 0.8; }

.field {
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 14px;
  background: var(--field);
  /* 평상시는 중립. 예전엔 --focus-border + --focus-ring 이 상시 걸려 있어
     늘 포커스된 것처럼 보였고, 거기에 input 자신의 outline 이 겹쳐 이중 링이 됐다. */
  border: 1px solid rgb(var(--mid-rgb) / 0.16);
  border-radius: var(--radius);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.field:focus-within {
  border-color: var(--focus-border);
  box-shadow: var(--focus-ring);
}
.field.bad { border-color: rgb(var(--danger-rgb) / 0.6); box-shadow: 0 0 0 3px rgb(var(--danger-rgb) / 0.12); }
/* 화면에서는 감추되 DOM 에는 남긴다 — display:none 이면 암호 관리자가 못 본다 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.field input {
  width: 100%;
  font-family: var(--font-mono);
  font-size: var(--title-size);
  letter-spacing: 0.28em;
  color: var(--ink);
}

.note { font-size: var(--fs-2xs); line-height: 1.7; color: var(--faint); }

.actions { display: flex; align-items: center; justify-content: flex-end; gap: 9px; margin-top: 2px; }
/* 두 버튼 높이를 맞춘다 — 테두리 유무 때문에 37.6 / 39.6 으로 어긋나 있었다.
   헤더 밖 조작 요소라 44px. */
.actions > * { min-height: 44px; box-sizing: border-box; }
.primary {
  display: flex;
  align-items: center;
  gap: 7px;
  /* base.css 의 .btn.primary 와 같은 처방 — tokens.css 의 --primary-fill 주석 참고 */
  background: var(--primary-fill);
  color: var(--ink);
  border-radius: var(--radius);
  padding: 9px 15px;
  font-size: var(--fs-xs);
  cursor: pointer;
}
.primary:hover:not(:disabled) { filter: brightness(1.2); }
.primary:disabled { opacity: 0.5; cursor: default; }
.ghost {
  display: flex;
  align-items: center;
  padding: 9px 15px;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  font-size: var(--fs-xs);
  color: var(--mid);
}
</style>
