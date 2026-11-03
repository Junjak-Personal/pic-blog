<script setup lang="ts">
definePageMeta({ layout: 'editor' })
const { loggedIn } = useUserSession()
useHead({ title: 'AI 연결 승인 — pic·blog', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const id = computed(() => typeof route.query.request === 'string' ? route.query.request : '')
const { data: request, status, error, refresh } = await useFetch(() => `/api/oauth/requests/${encodeURIComponent(id.value)}`, { watch: [loggedIn] })
const busy = ref(false)
const failed = ref('')
async function decide(allow: boolean) {
  if (busy.value) return
  busy.value = true
  failed.value = ''
  try {
    const result = await $fetch(`/api/oauth/requests/${encodeURIComponent(id.value)}`, { method: 'POST', body: { allow } })
    window.location.assign(result.redirect)
  } catch {
    failed.value = '처리하지 못했습니다. AI 앱에서 다시 연결해 주세요.'
    busy.value = false
  }
}
</script>
<template>
  <main class="consent">
    <h1>AI 연결 승인</h1>
    <p v-if="status === 'pending'" role="status">승인 요청을 확인하고 있습니다…</p>
    <div v-else-if="error || !request" role="alert">
      <p>승인 요청이 없거나 만료됐습니다. AI 앱에서 다시 연결해 주세요.</p>
      <button class="btn" data-testid="oauth-request-retry" @click="refresh()">다시 확인</button>
    </div>
    <template v-else>
      <p><strong>{{ request.clientHost }}</strong>의 AI가 Picblog에 연결하려 합니다.</p>
      <ul>
        <li>비공개를 포함한 모든 기록·포인트 글과 사진 메타데이터를 읽습니다.</li>
        <li>기록 제목·요약·기간과 포인트 제목·본문·태그·링크·소비 금액을 수정합니다.</li>
        <li>사진 업로드·삭제·공개 전환 권한은 없습니다.</li>
      </ul>
      <p class="notice">이 연결을 직접 시작했을 때만 허용하세요. 남이 보낸 링크로 왔다면 거부하세요.</p>
      <p>허용 후 돌아갈 곳: <strong>{{ request.redirectHost }}</strong></p>
      <p v-if="request.loopback">이 컴퓨터의 프로그램으로 돌아갑니다. 지금 직접 실행한 프로그램이 아니라면 거부하세요.</p>
      <p v-if="failed" role="alert">{{ failed }}</p>
      <div class="actions">
        <button class="btn" data-testid="oauth-consent-deny" :disabled="busy" @click="decide(false)">거부</button>
        <button class="btn primary" data-testid="oauth-consent-allow" :disabled="busy" @click="decide(true)">{{ busy ? '처리 중…' : '허용' }}</button>
      </div>
    </template>
    <NuxtLink class="btn" to="/editor/ai">AI 연결 관리</NuxtLink>
  </main>
</template>
<style scoped>
.consent { flex: 1; min-height: 0; overflow-y: auto; padding: var(--topbar-x); display: flex; flex-direction: column; gap: var(--topbar-gap); color: var(--ink); font-size: var(--fs-lg); }
h1 { font-size: var(--fs-display); }
ul { padding-inline-start: var(--topbar-x); }
.notice { padding: var(--topbar-x-sm); border: thin solid var(--selected-border); border-radius: var(--radius); background: var(--selected); }
.actions { display: flex; justify-content: flex-end; gap: var(--topbar-gap); }
.btn { border: thin solid var(--border-control); }
[role='alert'] { color: var(--danger); }
</style>
