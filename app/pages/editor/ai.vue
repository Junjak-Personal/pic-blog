<script setup lang="ts">
import { askConfirm } from '~/composables/useConfirm'
definePageMeta({ layout: 'editor' })
const { loggedIn } = useUserSession()
useHead({ title: 'AI 연결 관리 — pic·blog' })
const { data, status, error, refresh } = await useFetch('/api/oauth/connections', { watch: [loggedIn] })
const busy = ref(false)
const message = ref('')
async function copy() {
  try { await navigator.clipboard.writeText(data.value?.mcpUrl ?? ''); message.value = '연결 주소를 복사했습니다.' }
  catch { message.value = '복사하지 못했습니다. 표시된 주소를 직접 복사하세요.' }
}
async function revoke(id?: string) {
  if (busy.value) return
  if (!(await askConfirm({ title: id ? '이 AI 연결을 끊을까요?' : '모든 AI 연결을 끊을까요?', body: '다시 사용하려면 AI 앱에서 연결을 새로 승인해야 합니다.', confirmLabel: '연결 끊기', danger: true }))) return
  busy.value = true
  message.value = ''
  try {
    if (id) await $fetch(`/api/oauth/connections/${encodeURIComponent(id)}`, { method: 'DELETE' })
    else await $fetch('/api/oauth/connections', { method: 'DELETE' })
    await refresh()
    message.value = '연결을 끊었습니다.'
  } catch { message.value = '연결을 끊지 못했습니다. 다시 시도하세요.' }
  finally { busy.value = false }
}
</script>
<template>
  <main class="connections">
    <header><NuxtLink to="/editor" class="btn">기록 관리</NuxtLink><h1>AI 연결</h1></header>
    <p>Claude 또는 ChatGPT의 사용자 지정 커넥터에 아래 주소를 입력하세요. Claude Code에서도 HTTP MCP 서버 주소로 사용합니다.</p>
    <p>연결한 AI는 비공개 기록을 읽고 글을 수정할 수 있습니다. 사진 업로드·삭제·공개 전환은 지원하지 않습니다.</p>
    <p v-if="status === 'pending'" role="status">연결 정보를 불러오는 중…</p>
    <div v-else-if="error" role="alert"><p>연결 정보를 불러오지 못했습니다.</p><button class="btn" data-testid="ai-connections-retry" @click="refresh()">다시 시도</button></div>
    <template v-else-if="data">
      <div class="address"><code>{{ data.mcpUrl }}</code><button class="btn" data-testid="ai-url-copy" @click="copy">주소 복사</button></div>
      <p v-if="!data.connections.length">연결된 AI가 없습니다.</p>
      <article v-for="connection in data.connections" :key="connection.id">
        <div><strong>{{ connection.clientHost }}</strong><p>연결: {{ new Date(connection.createdAt).toLocaleString('ko-KR') }}</p><p>최근 사용: {{ new Date(connection.lastUsedAt).toLocaleString('ko-KR') }}</p></div>
        <button class="btn" :data-testid="`ai-connection-revoke-${connection.id}`" :disabled="busy" @click="revoke(connection.id)">연결 끊기</button>
      </article>
      <div v-if="data.connections.length" class="actions"><button class="btn danger" data-testid="ai-connections-revoke-all" :disabled="busy" @click="revoke()">모든 연결 끊기</button></div>
    </template>
    <p v-if="message" role="status">{{ message }}</p>
  </main>
</template>
<style scoped>
.connections { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--topbar-gap); padding: var(--topbar-x); color: var(--ink); font-size: var(--fs-lg); }
header, .address, article { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--topbar-gap); }
h1 { font-size: var(--fs-display); }
article { background: var(--surface-raised); padding: var(--topbar-x-sm); border: thin solid var(--hair); border-radius: var(--radius); }
code { overflow-wrap: anywhere; }
.actions { display: flex; justify-content: flex-end; }
.btn { border: thin solid var(--border-control); }
.danger, [role='alert'] { color: var(--danger); }
</style>
