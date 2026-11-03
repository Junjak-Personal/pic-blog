<script setup lang="ts">
import type { PostDetail, Point } from '#shared/types/db'
import type { PhotoAiProposal, PhotoAiRequest } from '#shared/types/photo-ai'
import { askConfirm } from '~/composables/useConfirm'

definePageMeta({ layout: 'editor', key: route => route.path })
const route = useRoute()
const slug = String(route.params.slug)
const endpoint = `/api/posts/${encodeURIComponent(slug)}/ai`
const storageKey = `pic-blog:ai:${slug}`
const { loggedIn } = useUserSession()
const { data: post, status, error: loadError, refresh } = await useFetch<PostDetail>(`/api/posts/${encodeURIComponent(slug)}`, { watch: [loggedIn] })
const context = ref('')
const sendImages = ref(false)
const consent = ref(false)
const unlocked = ref<number[]>([])
const proposal = ref<PhotoAiProposal | null>(null)
const requestId = ref<string | null>(null)
const lastRequest = ref<PhotoAiRequest | null>(null)
const operation = ref<'idle' | 'checking' | 'generating' | 'apply' | 'undo' | 'cancel'>('idle')
const message = ref('')
const photos = computed(() => post.value?.points.flatMap((point) => point.photos) ?? [])
const selectedPhotoCount = computed(() => post.value?.points.reduce((count, point) => count + (unlocked.value.includes(point.id) && !protectedContent(point) ? point.photos.length : 0), 0) ?? 0)
const busy = computed(() => operation.value !== 'idle')
const pending = computed(() => proposal.value?.status === 'pending')
const canGenerate = computed(() => !!post.value && selectedPhotoCount.value > 0 && selectedPhotoCount.value <= 1000 && consent.value && !busy.value && !pending.value)
const canRetry = computed(() => proposal.value?.status === 'failed' && proposal.value.usage.attempts < 2 && lastRequest.value?.requestId === requestId.value && !busy.value)
const photoById = computed(() => new Map(photos.value.map((photo) => [photo.id, photo])))
let previousOptions = ''
let pollTimer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
let epoch = 0
let disposed = false

onMounted(() => {
  try {
    requestId.value = sessionStorage.getItem(storageKey)
    const saved: unknown = JSON.parse(sessionStorage.getItem(`${storageKey}:request`) ?? 'null')
    if (saved && typeof saved === 'object' && 'requestId' in saved && saved.requestId === requestId.value && typeof saved.requestId === 'string'
      && 'context' in saved && typeof saved.context === 'string' && 'sendImages' in saved && typeof saved.sendImages === 'boolean'
      && 'protectedPointIds' in saved && Array.isArray(saved.protectedPointIds)
      && saved.protectedPointIds.every((id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
      lastRequest.value = { requestId: saved.requestId, context: saved.context, sendImages: saved.sendImages, protectedPointIds: saved.protectedPointIds }
      context.value = saved.context
      sendImages.value = saved.sendImages
      const protectedPointIds = lastRequest.value.protectedPointIds
      unlocked.value = post.value?.points.filter(point => !protectedPointIds.includes(point.id) && !protectedContent(point)).map(point => point.id) ?? []
    }
  } catch { /* Session storage can be unavailable; the current page still works. */ }
  if (requestId.value) void check()
})
onBeforeUnmount(() => {
  disposed = true
  epoch++
  controller?.abort()
  stopPolling()
})

function protectedContent(point: Point) {
  return !!(point.title?.trim() || point.body?.trim() || point.tags.length || point.links.length || point.expenses.length
    || point.photos.some(photo => !Number.isFinite(photo.lat) || !Number.isFinite(photo.lng) || Math.abs(photo.lat) > 90 || Math.abs(photo.lng) > 180 || (photo.lat === 0 && photo.lng === 0)))
}
function errorText(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'statusMessage' in error.data && typeof error.data.statusMessage === 'string') return error.data.statusMessage
  return '처리하지 못했습니다. 연결을 확인하고 요청 상태를 다시 확인해 주세요.'
}
function stopPolling() {
  if (pollTimer !== undefined) clearTimeout(pollTimer)
  pollTimer = undefined
}
function startOperation(kind: Exclude<typeof operation.value, 'idle'>) {
  stopPolling()
  controller?.abort()
  controller = new AbortController()
  operation.value = kind
  message.value = ''
  return { epoch: ++epoch, signal: controller.signal }
}
function isCurrent(token: number) { return !disposed && token === epoch }
function finishOperation(token: number) {
  if (!isCurrent(token)) return
  operation.value = 'idle'
  if (pending.value) pollTimer = setTimeout(() => { void check(true) }, 2000)
}
function remember(id: string, request?: PhotoAiRequest) {
  requestId.value = id
  if (request) lastRequest.value = { ...request, requestId: id }
  try {
    sessionStorage.setItem(storageKey, id)
    if (lastRequest.value?.requestId === id) sessionStorage.setItem(`${storageKey}:request`, JSON.stringify(lastRequest.value))
  } catch { /* A storage failure must not hide an accepted server request. */ }
}
async function check(automatic = false) {
  const id = requestId.value
  if (!id || disposed || (automatic && busy.value)) return
  const request = startOperation('checking')
  try {
    const result = await $fetch<PhotoAiProposal>(`${endpoint}/${id}`, { signal: request.signal, retry: 0 })
    if (isCurrent(request.epoch)) proposal.value = result
  } catch (error) {
    if (isCurrent(request.epoch)) message.value = errorText(error)
  } finally { finishOperation(request.epoch) }
}
async function generate(retry = false) {
  if (retry ? !canRetry.value : !canGenerate.value || !post.value) return
  let body: PhotoAiRequest
  if (retry && lastRequest.value) body = lastRequest.value
  else {
    if (!post.value) return
    const protectedPointIds = post.value.points.filter((point) => protectedContent(point) || !unlocked.value.includes(point.id)).map((point) => point.id)
    const options = JSON.stringify({ snapshot: post.value, context: context.value, sendImages: sendImages.value, protectedPointIds })
    const id = options === previousOptions && requestId.value ? requestId.value : crypto.randomUUID()
    previousOptions = options
    body = { requestId: id, context: context.value, sendImages: sendImages.value, protectedPointIds }
  }
  remember(body.requestId, body)
  proposal.value = null
  const request = startOperation('generating')
  try {
    const result = await $fetch<PhotoAiProposal>(`${endpoint}/proposals`, { method: 'POST', retry: 0, signal: request.signal, body })
    if (!isCurrent(request.epoch)) return
    proposal.value = result
    remember(result.id, body)
  } catch (error) {
    if (isCurrent(request.epoch)) message.value = errorText(error)
  } finally { finishOperation(request.epoch) }
}
async function action(kind: 'apply' | 'undo' | 'cancel') {
  const id = proposal.value?.id ?? requestId.value
  if (!id || disposed || operation.value === 'cancel') return
  if (kind !== 'cancel') {
    if (busy.value) return
    const token = epoch
    if (!await askConfirm({ title: kind === 'apply' ? '검토한 구성을 적용할까요?' : 'AI 적용 전으로 되돌릴까요?', body: '다른 편집이 저장된 뒤에는 충돌을 막기 위해 적용 또는 되돌리기가 거절됩니다.', confirmLabel: kind === 'apply' ? '적용' : '되돌리기' })) return
    if (!isCurrent(token)) return
  }
  const request = startOperation(kind)
  try {
    const result = await $fetch<PhotoAiProposal>(`${endpoint}/${id}/${kind}`, { method: 'POST', body: {}, retry: 0, signal: request.signal })
    if (!isCurrent(request.epoch)) return
    proposal.value = result
    if (kind !== 'cancel') await refresh()
  } catch (error) {
    if (isCurrent(request.epoch)) message.value = errorText(error)
  } finally { finishOperation(request.epoch) }
}
</script>

<template>
  <div class="ai-page">
    <header class="ai-header">
      <NuxtLink :to="`/editor/${slug}`" class="btn" data-testid="photo-ai-back">편집으로</NuxtLink>
      <h1>AI로 포인트 정리</h1>
    </header>
    <main class="ai-content">
      <p v-if="status === 'pending'" role="status">기록을 불러오는 중…</p>
      <div v-else-if="loadError || !post" role="alert"><p>기록을 불러오지 못했습니다.</p><button class="btn" data-testid="photo-ai-load-retry" @click="refresh()">다시 불러오기</button></div>
      <template v-else>
        <h2>{{ post.title }}</h2>
        <p>장소·촬영 시각·추가 맥락으로 사진을 묶고 포인트 제목을 제안합니다. 먼저 결과를 검토하고 「적용」을 눌러야 저장됩니다.</p>
        <p v-if="!photos.length">분석할 사진이 없습니다. 편집 화면에서 사진을 먼저 추가해 주세요.</p>
        <p data-testid="photo-ai-selected-count">선택한 사진 {{ selectedPhotoCount.toLocaleString() }}장 / 최대 1,000장 · 전체 {{ photos.length.toLocaleString() }}장</p>
        <p v-if="selectedPhotoCount > 1000" role="alert">선택한 사진은 한 번에 최대 1,000장까지 분석할 수 있습니다. 일부 포인트를 선택 해제해 주세요.</p>
        <fieldset :disabled="busy || proposal?.status === 'pending'">
          <legend>분석 범위</legend>
          <label for="ai-context">추가 맥락 (선택)</label>
          <textarea id="ai-context" v-model="context" maxlength="1000" rows="3" data-testid="photo-ai-context" placeholder="예: 오전에는 시장, 오후에는 해변에서 보낸 여행" />
          <label class="check"><input v-model="sendImages" type="checkbox" data-testid="photo-ai-images"> 사진 썸네일도 함께 보내기</label>
          <p>하루 최대 20개 작업, 같은 제안은 최대 2회 시도합니다. 사진이 많으면 나누어 분석하며 몇 분이 걸릴 수 있습니다. 취소 전에 전송된 요청은 비용이 발생할 수 있습니다.</p>
          <p>Claude(Anthropic)에 선택한 그룹의 사진 ID·분 단위 촬영 시각·소수점 4자리 위치 및 입력한 맥락을 보냅니다. 보호된 그룹의 사진과 기록은 보내지 않습니다. 사진 전송을 선택하면 썸네일도 전송합니다. 원본 사진은 보내지 않습니다. 인물의 신원이나 민감한 내용은 분석 대상으로 삼지 않습니다.</p>
          <p>민감한 사진이나 위치가 포함되었는지 먼저 확인해 주세요. 위치가 불확실한 사진의 좌표는 추측해 바꾸지 않습니다.</p>
          <label class="check"><input v-model="consent" type="checkbox" data-testid="photo-ai-consent"> 전송 범위를 확인했고 Claude 분석에 동의합니다.</label>
          <h3>재배치할 포인트 선택</h3>
          <p>기존 그룹은 기본적으로 보호합니다. 아래에서 선택한 그룹만 다시 묶습니다. 제목·본문·태그·링크·금액이 있거나 위치가 불확실한 사진이 있는 포인트는 항상 보호합니다.</p>
          <label v-for="(point, index) in post.points" :key="point.id" class="check">
            <input v-model="unlocked" :value="point.id" :disabled="protectedContent(point)" type="checkbox" :data-testid="`photo-ai-unlock-${point.id}`">
            {{ point.title || `포인트 ${index + 1}` }} · {{ point.photos.length }}장 {{ protectedContent(point) ? '· 보호됨' : '' }}
          </label>
        </fieldset>
        <p v-if="message" role="alert">{{ message }}</p>
        <p v-if="busy && !pending" role="status">{{ operation === 'generating' ? '분석 요청을 보내는 중…' : operation === 'cancel' ? '요청을 취소하는 중…' : '처리 중…' }}</p>
        <div class="actions">
          <button v-if="requestId" class="btn" :disabled="busy" data-testid="photo-ai-status" @click="check()">요청 상태 확인</button>
          <button v-if="pending || proposal?.status === 'ready'" class="btn" :disabled="operation === 'cancel' || operation === 'apply' || operation === 'undo'" data-testid="photo-ai-cancel" @click="action('cancel')">요청 취소</button>
          <button v-if="proposal?.status === 'failed' && proposal.usage.attempts < 2" class="btn" :disabled="!canRetry" data-testid="photo-ai-retry" @click="generate(true)">한 번 더 시도</button>
          <button class="btn primary" :disabled="!canGenerate || proposal?.status === 'pending'" data-testid="photo-ai-generate" @click="generate()">새 제안 생성</button>
        </div>
        <section v-if="proposal" class="result" aria-live="polite">
          <h2>{{ proposal.status === 'applied' ? '적용 완료' : proposal.status === 'undone' ? '되돌리기 완료' : '분석 결과' }}</h2>
          <div v-if="proposal.status === 'pending'" role="status" data-testid="photo-ai-progress">
            <p v-if="proposal.progress">선택한 사진 {{ proposal.progress.totalPhotos.toLocaleString() }}장 중 {{ proposal.progress.processedPhotos.toLocaleString() }}장 분석 완료 · {{ proposal.progress.completedBatches }} / {{ proposal.progress.totalBatches }}묶음</p>
            <p v-else>사진을 분석할 준비를 하고 있습니다.</p>
            <p>진행 상황은 자동으로 갱신됩니다. 새로고침해도 이 작업의 상태를 다시 확인합니다.</p>
          </div>
          <p v-if="proposal.status === 'cancelled' || proposal.status === 'failed'">{{ proposal.message }}</p>
          <p>작업 시도 {{ proposal.usage.attempts }}회 · 입력 {{ proposal.usage.inputTokens }} / 출력 {{ proposal.usage.outputTokens }} 토큰</p>
          <article v-for="(group, index) in proposal.groups" :key="index" class="group">
            <h3>{{ group.title || `포인트 ${index + 1}` }}</h3>
            <p>{{ group.reason }}</p>
            <p>{{ group.pointId === null ? '새 그룹' : `기존 포인트 ${group.pointId}` }} · {{ group.photoIds.length }}장 {{ group.pointId !== null && proposal.protectedPointIds.includes(group.pointId) ? '· 보호됨' : '' }}</p>
            <div class="thumbnails"><img v-for="id in group.photoIds" :key="id" :src="photoById.get(id)?.thumb_path" :alt="`사진 ${id}`" loading="lazy"></div>
          </article>
          <div class="actions">
            <button v-if="proposal.status === 'applied'" class="btn" :disabled="busy" data-testid="photo-ai-undo" @click="action('undo')">적용 전으로 되돌리기</button>
            <button v-if="proposal.status === 'ready'" class="btn primary" :disabled="busy" data-testid="photo-ai-apply" @click="action('apply')">검토한 구성 적용</button>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.ai-page { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.ai-header { display: flex; align-items: center; flex-wrap: wrap; gap: var(--topbar-gap); padding: var(--topbar-x); border-bottom: thin solid var(--hair); }
h1 { font-size: var(--title-size); }
h2 { font-size: var(--fs-2xl); }
h3 { font-size: var(--fs-lg); }
.ai-content { overflow-y: auto; padding: var(--topbar-x); display: grid; gap: var(--topbar-gap); }
p { color: var(--mid); font-size: var(--fs-md); }
fieldset, .result, .group { display: grid; gap: var(--topbar-gap); padding: var(--topbar-x-sm); border: thin solid var(--hair); border-radius: var(--radius); min-width: 0; }
textarea { width: 100%; background: var(--field); color: var(--ink); border: thin solid var(--border-control); border-radius: var(--radius-sm); padding: var(--topbar-x-sm); }
.check { display: flex; gap: var(--topbar-gap); align-items: center; font-size: var(--fs-md); }
.check input { flex: none; }
.actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--topbar-gap); }
.btn { border: thin solid var(--border-control); background: var(--s2); }
.btn.primary { background: var(--primary-fill); }
.thumbnails { display: flex; flex-wrap: wrap; gap: var(--topbar-gap); }
.thumbnails img { width: var(--tile-w); height: var(--tile-img-h); object-fit: cover; border-radius: var(--radius-sm); }
[role='alert'] { color: var(--danger); }
</style>
