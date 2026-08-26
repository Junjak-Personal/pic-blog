<script setup lang="ts">
/** 아트보드 1e — 비밀번호 화면. 읽기 경로는 이 화면을 절대 만나지 않는다. */
const { fetch: refreshSession } = useUserSession()

const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  if (!password.value || busy.value) return
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
    <form class="card" @submit.prevent="submit">
      <header>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>
        <span>{{ error ? '비밀번호가 맞지 않습니다' : '편집 잠금' }}</span>
      </header>

      <div class="body">
        <div class="intro">
          <h3>비밀번호를 입력하세요</h3>
          <p>읽기는 링크만으로 가능하고, 편집은 이 기기에서 비밀번호를 한 번 확인합니다.</p>
        </div>

        <label class="field" :class="{ bad: !!error }">
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            :disabled="busy"
            aria-label="편집 비밀번호"
          >
        </label>

        <p class="note mono">비밀번호는 서버 환경변수에 있습니다 — 재발급은 배포로만.</p>

        <div class="actions">
          <button type="submit" class="primary mono" :disabled="busy || !password">
            {{ busy ? '확인 중…' : '편집 시작' }}
          </button>
          <NuxtLink to="/" class="ghost mono">읽기로 돌아가기</NuxtLink>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.gate { flex: 1; display: grid; place-items: center; padding: 24px; }

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
  font-size: 14.5px;
}
header svg { display: block; flex: none; }

.body { display: flex; flex-direction: column; gap: 16px; padding: 32px 40px 36px; }

.intro { display: flex; flex-direction: column; gap: 8px; }
h3 { font-size: 24px; letter-spacing: -0.02em; color: var(--ink); }
.intro p { max-width: 420px; font-size: 13.5px; line-height: 1.65; color: var(--mid); opacity: 0.8; }

.field {
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 14px;
  background: var(--field);
  border: 1px solid var(--focus-border);
  border-radius: var(--radius);
  box-shadow: var(--focus-ring);
}
.field.bad { border-color: rgba(255, 128, 128, 0.6); box-shadow: 0 0 0 3px rgba(255, 128, 128, 0.12); }
.field input {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 17px;
  letter-spacing: 0.28em;
  color: var(--ink);
}

.note { font-size: 10.5px; line-height: 1.7; color: var(--faint); }

.actions { display: flex; align-items: center; gap: 9px; margin-top: 2px; }
.primary {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--mid);
  color: var(--s0);
  border-radius: var(--radius);
  padding: 9px 15px;
  font-size: 11px;
  cursor: pointer;
}
.primary:disabled { opacity: 0.5; cursor: default; }
.ghost {
  display: flex;
  align-items: center;
  padding: 9px 15px;
  border: 1px solid rgba(177, 199, 193, 0.2);
  border-radius: var(--radius);
  font-size: 11px;
  color: var(--mid);
}
</style>
