<script setup lang="ts">
/**
 * 포스트 편집 — 아트보드 1e. 업로드 플로우의 마지막 단계이기도 하다 (설계문서 §7.1).
 * 측량값(좌표 · 촬영 시각 · 포인트 순서)은 읽기 전용으로만 보여준다 (§7.2).
 *
 * 모든 편집은 로컬 초안에 쌓였다가 「저장」에서 한 번에 서버로 나간다 —
 * 그래서 상단바가 「변경 N건 · 저장 안 됨」을 셀 수 있고, 저장 없이 나가면 물어볼 수 있다.
 */
import { onBeforeRouteLeave } from 'vue-router'
import type { Photo, PostDetail } from '#shared/types/db'
// 자동 임포트에 기대지 않는다 — unimport 스캐너가 연속된 `export const` 중 두 번째부터 놓친다
import { formatDateTime, formatRange } from '#shared/utils/format'

interface PointDraft {
  id: number
  title: string
  body: string
  tags: string[]
  /** 사진 순서. 삭제한 사진은 여기서 빠진다. */
  ids: number[]
}

const MAX_BODY = 2000
const MAX_TAGS = 20

definePageMeta({ layout: 'editor' })

const route = useRoute()
const router = useRouter()
const slug = computed(() => String(route.params.slug))

const { data: post, refresh } = await useFetch<PostDetail>(() => `/api/posts/${slug.value}`)

const draftTitle = ref('')
const draftSummary = ref('')
const draftPublic = ref(false)
const pointDrafts = ref<PointDraft[]>([])
/** 삭제 예약. 저장 전까지는 DB 도 디스크도 건드리지 않는다. */
const removedPhotoIds = ref<number[]>([])
const activeId = ref<number | null>(null)
const tagInput = ref('')
const saving = ref(false)
const errorMessage = ref<string | null>(null)

const photoById = computed(
  () => new Map((post.value?.points ?? []).flatMap((p) => p.photos).map((ph) => [ph.id, ph])),
)
const activeDraft = computed(() => pointDrafts.value.find((d) => d.id === activeId.value))
const activeIndex = computed(() => pointDrafts.value.findIndex((d) => d.id === activeId.value))
const activePoint = computed(() => post.value?.points.find((p) => p.id === activeId.value) ?? null)
const activePhotos = computed<Photo[]>(() => {
  const ids = activeDraft.value?.ids ?? []
  return ids.map((id) => photoById.value.get(id)).filter((p): p is Photo => p !== undefined)
})

/**
 * 커버는 「첫 포인트의 첫 사진」이다 — 서버의 커버 복구 문장(photos/[id].delete)과 같은 규칙이라
 * 별도 커버 지정 버튼 없이 그리드 첫 칸으로 끌어오는 것만으로 커버가 바뀐다.
 */
const coverId = computed(() => pointDrafts.value.find((d) => d.ids.length)?.ids[0] ?? null)

const changes = computed(() => {
  const p = post.value
  if (!p) return 0
  let n = 0
  if (draftTitle.value.trim() !== p.title) n++
  if (draftSummary.value.trim() !== (p.summary ?? '')) n++
  if (draftPublic.value !== p.is_public) n++
  n += removedPhotoIds.value.length
  for (const d of pointDrafts.value) {
    const base = p.points.find((x) => x.id === d.id)
    if (!base) continue
    if (d.title.trim() !== (base.title ?? '')) n++
    if (d.body.trim() !== (base.body ?? '')) n++
    if (d.tags.join('\n') !== base.tags.join('\n')) n++
    if (d.ids.join(',') !== keptIds(base.photos).join(',')) n++
  }
  return n
})

hydrate()

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

onBeforeRouteLeave(
  () =>
    changes.value === 0 ||
    window.confirm(`저장하지 않은 변경 ${changes.value}건이 있습니다. 저장하지 않고 나갈까요?`),
)

/** 서버 응답을 초안으로 되돌린다. 최초 진입 · 저장 직후 · 「취소」가 모두 이걸 부른다. */
function hydrate() {
  const p = post.value
  removedPhotoIds.value = []
  errorMessage.value = null
  tagInput.value = ''
  if (!p) {
    pointDrafts.value = []
    return
  }
  draftTitle.value = p.title
  draftSummary.value = p.summary ?? ''
  draftPublic.value = p.is_public
  pointDrafts.value = p.points.map((pt) => ({
    id: pt.id,
    title: pt.title ?? '',
    body: pt.body ?? '',
    tags: [...pt.tags],
    ids: pt.photos.map((ph) => ph.id),
  }))
  if (!pointDrafts.value.some((d) => d.id === activeId.value)) {
    activeId.value = pointDrafts.value[0]?.id ?? null
  }
}

/** 삭제 예약을 뺀 서버 기준 순서 — 재정렬이 실제로 일어났는지 판단하는 기준값 */
function keptIds(photos: readonly Photo[]) {
  return photos.map((ph) => ph.id).filter((id) => !removedPhotoIds.value.includes(id))
}

function basePoint(id: number) {
  return post.value?.points.find((p) => p.id === id) ?? null
}

/** 실패 사유를 그대로 보여준다 — 저장이 조용히 실패하면 안 된다 (설계문서 §8) */
function reason(e: unknown) {
  if (!(e instanceof Error)) return '저장하지 못했습니다'
  const detail = e as Error & { data?: { statusMessage?: string }; statusMessage?: string }
  // `??` 가 아니라 `||` 다 — FetchError.statusMessage 는 h3 가 비ASCII 를 털어낸 빈 문자열일 수 있고,
  // 빈 문자열이 통과하면 화면에 사유 없는 빈 줄만 남는다 (조용한 실패 — 설계문서 §8)
  return detail.data?.statusMessage || detail.statusMessage || e.message
}

function onReorder(ids: number[]) {
  const d = activeDraft.value
  if (d) d.ids = ids
}

function onRemove(id: number) {
  const d = activeDraft.value
  if (!d) return
  d.ids = d.ids.filter((x) => x !== id)
  if (!removedPhotoIds.value.includes(id)) removedPhotoIds.value.push(id)
}

function onAddPhotos() {
  // 라우트 중첩 충돌을 피해 /editor/add/[slug] 로 둔다 ([slug].vue 가 부모 라우트가 되면 편집 화면이 깨진다)
  void router.push(`/editor/add/${slug.value}`)
}

function addTag() {
  const t = tagInput.value.trim()
  tagInput.value = ''
  const d = activeDraft.value
  if (!t || !d || d.tags.includes(t) || d.tags.length >= MAX_TAGS) return
  d.tags.push(t)
}

function removeTag(tag: string) {
  const d = activeDraft.value
  if (d) d.tags = d.tags.filter((t) => t !== tag)
}

function revert() {
  if (!changes.value) return
  if (!window.confirm(`저장하지 않은 변경 ${changes.value}건을 되돌릴까요?`)) return
  hydrate()
}

async function save() {
  const p = post.value
  if (!p || saving.value || !changes.value) return
  if (!draftTitle.value.trim()) {
    errorMessage.value = '포스트 타이틀은 비울 수 없습니다'
    return
  }

  saving.value = true
  errorMessage.value = null
  try {
    // 1) 삭제가 먼저다 — 재정렬 API 는 그 포인트의 사진 「전량」을 요구한다
    for (const id of removedPhotoIds.value) {
      await $fetch(`/api/photos/${id}`, { method: 'DELETE' })
    }

    // 2) 포인트. 사진이 0장이 된 포인트는 위 삭제에서 함께 사라졌으므로 건너뛴다
    for (const d of pointDrafts.value) {
      if (!d.ids.length) continue
      const base = p.points.find((x) => x.id === d.id)
      if (!base) continue
      const fieldsDirty =
        d.title.trim() !== (base.title ?? '') ||
        d.body.trim() !== (base.body ?? '') ||
        d.tags.join('\n') !== base.tags.join('\n')
      if (fieldsDirty) {
        await $fetch(`/api/points/${d.id}`, {
          method: 'PATCH',
          body: { title: d.title.trim() || null, body: d.body.trim() || null, tags: d.tags },
        })
      }
      if (d.ids.join(',') !== keptIds(base.photos).join(',')) {
        await $fetch('/api/photos/reorder', { method: 'POST', body: { pointId: d.id, ids: d.ids } })
      }
    }

    // 3) 포스트가 마지막이다 — 커버는 삭제·재정렬이 끝나야 확정된다
    const body: {
      title: string
      summary: string | null
      is_public: boolean
      cover_photo_id?: number
    } = {
      title: draftTitle.value.trim(),
      summary: draftSummary.value.trim() || null,
      is_public: draftPublic.value,
    }
    if (coverId.value !== null && coverId.value !== p.cover_photo_id) {
      body.cover_photo_id = coverId.value
    }
    await $fetch(`/api/posts/${slug.value}`, { method: 'PATCH', body })

    await refresh()
    hydrate()
  } catch (e) {
    errorMessage.value = reason(e)
  } finally {
    saving.value = false
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!changes.value) return
  // 최신 브라우저는 preventDefault 만 본다 (returnValue 는 폐기된 경로다)
  e.preventDefault()
}
</script>

<template>
  <div class="page">
    <!-- 상단바 — 변경 건수 · 공개 토글 · 취소 · 저장 -->
    <header class="topbar">
      <div class="top-left">
        <span class="badge mono">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>
          편집 중
        </span>
        <span class="mono state" :class="{ dirty: changes > 0 }">
          {{ changes ? `변경 ${changes}건 · 저장 안 됨` : '변경 없음' }}
        </span>
        <span v-if="errorMessage" class="mono err">{{ errorMessage }}</span>
      </div>

      <div class="top-right">
        <span class="toggle-wrap">
          <button
            type="button"
            class="toggle"
            role="switch"
            :aria-checked="draftPublic"
            :class="{ on: draftPublic }"
            aria-label="공개 여부"
            @click="draftPublic = !draftPublic"
          >
            <span class="knob" />
          </button>
          <span class="toggle-label">공개</span>
        </span>
        <span class="rule" />
        <NuxtLink to="/editor" class="btn ghost mono wide-only">목록</NuxtLink>
        <button type="button" class="btn ghost mono wide-only" :disabled="!changes" @click="revert">취소</button>
        <button type="button" class="btn primary mono" :disabled="!changes || saving" @click="save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>
          {{ saving ? '저장 중' : '저장' }}
        </button>

        <!-- 모바일: 주 동작(저장)만 남기고 나머지는 ⋯ 로 접는다 -->
        <OverflowMenu label="기록 메뉴">
          <DropdownMenuItem class="ovf-item" :disabled="!changes" @select="revert">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4 -4l4 -4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></svg>
            변경 취소
            <span class="ovf-state">{{ changes ? `${changes}건` : '없음' }}</span>
          </DropdownMenuItem>
          <div class="ovf-sep" />
          <DropdownMenuItem as-child class="ovf-item">
            <NuxtLink to="/editor">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>
              기록 목록
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuItem as-child class="ovf-item">
            <NuxtLink :to="`/p/${slug}`">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6s-6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6s6.6 2 9 6" /></svg>
              공개 화면 보기
            </NuxtLink>
          </DropdownMenuItem>
        </OverflowMenu>
      </div>
    </header>

    <section v-if="!post" class="blank">
      <h3>기록을 찾을 수 없습니다</h3>
      <p class="mono">/editor/{{ slug }}</p>
    </section>

    <template v-else>
      <!-- 포스트 헤더 — 타이틀 · 요약은 편집, 기간은 EXIF 원본 -->
      <div class="posthead">
        <label class="field">
          <span class="mono flabel">포스트 타이틀</span>
          <input v-model="draftTitle" class="input title" maxlength="200" placeholder="기록 제목" data-testid="editor-title-input">
        </label>
        <label class="field">
          <span class="mono flabel">요약</span>
          <input v-model="draftSummary" class="input" maxlength="1000" placeholder="한 줄 요약" data-testid="editor-summary-input">
        </label>
        <div class="field locked">
          <span class="mono flabel">기간 · 촬영 시각</span>
          <div class="lockbox">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>
            <span class="mono lock-value">{{ formatRange(post.started_at, post.ended_at) || '기간 없음' }}</span>
            <span class="mono lock-note">EXIF 원본 · 편집 불가</span>
          </div>
        </div>
      </div>

      <div class="body">
        <!-- 좌: 포인트 목록. 순서는 촬영 시각 순으로 고정이라 이동 UI 가 없다 -->
        <aside class="points">
          <div class="points-head">
            <span class="mono ph-title">포인트 {{ pointDrafts.length }}</span>
            <span class="mono ph-lock">촬영 시각 순 고정</span>
          </div>
          <ol class="scroll-y point-list">
            <li
              v-for="(pt, i) in pointDrafts"
              :key="pt.id"
              class="prow"
              :class="{ on: pt.id === activeId }"
              :data-testid="`editor-point-row-${i}`"
              @click="activeId = pt.id"
            >
              <span class="mono pnum">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="pmain">
                <span class="pname">{{ pt.title.trim() || '이름 없는 포인트' }}</span>
                <span class="mono psub">
                  {{ formatDateTime(basePoint(pt.id)?.first_shot_at ?? null) || '시각 없음' }}
                </span>
              </span>
              <span class="mono pcount" :class="{ zero: !pt.ids.length }">{{ pt.ids.length }}장</span>
            </li>
          </ol>
        </aside>

        <!-- 우: 선택된 포인트 편집 -->
        <section v-if="activeDraft && activePoint" class="editor">
          <div class="ehead">
            <span class="mono enum">{{ String(activeIndex + 1).padStart(2, '0') }}</span>
            <input
              v-model="activeDraft.title"
              class="input title ptitle"
              maxlength="200"
              placeholder="포인트 이름"
              data-testid="editor-point-title-input"
            >
            <span class="lockrow">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>
              <span class="mono">
                {{ formatDateTime(activePoint.first_shot_at) || '시각 없음' }}
                · {{ activePoint.lat.toFixed(5) }}, {{ activePoint.lng.toFixed(5) }}
              </span>
              <span class="mono lock-note">EXIF 원본</span>
            </span>
          </div>

          <div class="split">
            <div class="grid-col">
              <PhotoOrderGrid
                :photos="activePhotos"
                :cover-id="coverId"
                @reorder="onReorder"
                @remove="onRemove"
                @add="onAddPhotos"
              />
              <p v-if="!activeDraft.ids.length" class="mono warn">
                사진이 0장인 포인트는 저장할 때 함께 삭제됩니다
              </p>
            </div>

            <div class="scroll-y side">
              <div class="field">
                <span class="mono flabel">태그</span>
                <div class="tags">
                  <span v-for="t in activeDraft.tags" :key="t" class="chip mono">
                    {{ t }}
                    <button type="button" class="chip-x" :aria-label="`태그 ${t} 삭제`" @click="removeTag(t)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
                    </button>
                  </span>
                  <span v-if="activeDraft.tags.length < MAX_TAGS" class="chip-add">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
                    <input
                      v-model="tagInput"
                      class="mono tag-input"
                      maxlength="40"
                      placeholder="태그"
                      data-testid="editor-tag-input"
                      @keydown.enter.prevent="addTag"
                      @blur="addTag"
                    >
                  </span>
                </div>
              </div>

              <div class="field grow">
                <span class="flabel-row">
                  <span class="mono flabel">콘텐츠</span>
                  <span class="mono counter" :class="{ full: activeDraft.body.length >= MAX_BODY }">
                    {{ activeDraft.body.length }} / {{ MAX_BODY }}
                  </span>
                </span>
                <textarea
                  v-model="activeDraft.body"
                  class="content"
                  :maxlength="MAX_BODY"
                  placeholder="이 포인트에서 있었던 일을 적습니다"
                  data-testid="editor-point-body-input"
                />
              </div>
            </div>
          </div>
        </section>

        <section v-else class="editor blank">
          <h3>포인트를 선택하세요</h3>
          <p class="mono">왼쪽 목록에서 편집할 포인트를 고릅니다</p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { flex: 1; display: flex; flex-direction: column; min-height: 0; }

/* 상단바 */
.topbar {
  height: 60px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(146, 178, 169, 0.28);
  background: rgba(146, 178, 169, 0.06);
}
.top-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.top-right { display: flex; align-items: center; gap: 14px; flex: none; }

.badge {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--acc);
  color: var(--s0);
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.state { font-size: 10.5px; color: var(--faint); white-space: nowrap; }
.state.dirty { color: var(--deep); }
.err {
  font-size: 10.5px;
  color: var(--danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle-wrap { display: flex; align-items: center; gap: 9px; }
.toggle {
  position: relative;
  width: 42px;
  height: 24px;
  flex: none;
  border-radius: 999px;
  background: rgba(177, 199, 193, 0.18);
  border: 1px solid var(--hair);
  cursor: pointer;
  transition: background 0.15s;
}
.toggle.on { background: rgba(146, 178, 169, 0.9); border-color: var(--acc); }
.knob {
  position: absolute;
  left: 3px;
  top: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--mid);
  display: block;
  transition: transform 0.15s;
}
.toggle.on .knob { background: var(--s0); transform: translateX(18px); }
.toggle-label { font-size: 13px; color: var(--mid); }
.rule { width: 1px; height: 22px; background: rgba(177, 199, 193, 0.16); }

.btn {
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: var(--radius);
  padding: 8px 13px;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.btn.primary { background: var(--mid); color: var(--s0); }
.btn.ghost { border: 1px solid rgba(177, 199, 193, 0.2); color: var(--mid); }
.btn:disabled { opacity: 0.4; cursor: default; }

/* 포스트 헤더 */
.posthead {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(177, 199, 193, 0.1);
}
.field { display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 0; }
.field.locked { flex: none; width: 320px; }
.flabel { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.flabel-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }

.input {
  width: 100%;
  background: var(--field);
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
  padding: 9px 14px;
  font-size: 14px;
  color: var(--ink);
}
.input:focus {
  border-color: var(--focus-border);
  box-shadow: var(--focus-ring);
  outline: none;
}
.input.title {
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.input::placeholder { color: var(--faint); }

.lockbox {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--s1);
  border: 1px dashed rgba(177, 199, 193, 0.18);
  border-radius: var(--radius);
  padding: 11px 14px;
  color: var(--faint);
}
.lock-value { font-size: 11px; color: var(--mid); }
.lock-note { margin-left: auto; font-size: 9.5px; color: var(--faint); white-space: nowrap; }

/* 본문 2열 */
.body { flex: 1; display: grid; grid-template-columns: 348px 1fr; min-height: 0; }

.points {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--hair);
  background: rgba(11, 14, 18, 0.92);
}
.points-head {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 15px 18px 13px;
  border-bottom: 1px solid var(--hair);
}
.ph-title { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mid); }
.ph-lock { font-size: 10px; color: var(--faint); }

/* min-height:0 + overflow 가 없으면 포인트가 많을 때 목록이 패널을 넘어
   아래 편집 블록 위로 흘러넘친다 (모바일에서 겹쳐 보이던 증상의 루트 원인) */
.point-list { flex: 1; min-height: 0; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.prow {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 11px;
  align-items: center;
  padding: 11px 14px 11px 18px;
  border-bottom: 1px solid var(--hair-soft);
  cursor: pointer;
}
.prow:hover { background: rgba(232, 235, 233, 0.06); }
.prow.on { background: rgba(232, 235, 233, 0.1); }
.pnum {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 10.5px;
  font-weight: 600;
  background: rgba(16, 19, 23, 0.94);
  color: var(--mid);
  border: 1px solid rgba(146, 178, 169, 0.6);
}
.prow.on .pnum { background: var(--ink); color: var(--s0); border-color: var(--ink); }
.pmain { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pname {
  font-size: 14.5px;
  line-height: 1.2;
  color: var(--mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prow.on .pname { color: var(--ink); }
.psub { font-size: 10px; color: var(--faint); white-space: nowrap; }
.pcount { font-size: 10px; color: var(--faint); white-space: nowrap; }
.pcount.zero { color: var(--danger); }

/* 선택된 포인트 편집 */
.editor { display: flex; flex-direction: column; min-width: 0; min-height: 0; }

.ehead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px 12px;
  border-bottom: 1px solid rgba(177, 199, 193, 0.1);
}
.enum {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 50%;
  background: var(--ink);
  color: var(--s0);
  font-size: 12px;
  font-weight: 600;
}
.ptitle { flex: 1; min-width: 0; }
.lockrow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 8px 12px;
  border: 1px dashed rgba(177, 199, 193, 0.18);
  border-radius: var(--radius);
  font-size: 10.5px;
  color: var(--faint);
  white-space: nowrap;
}
.lockrow .lock-note { margin-left: 4px; }

.split { flex: 1; display: grid; grid-template-columns: 1fr 352px; min-height: 0; }
.grid-col {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 15px 24px;
  min-width: 0;
  min-height: 0;
}
.warn { flex: none; font-size: 10px; color: var(--danger); }

.side {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 15px 24px;
  border-left: 1px solid rgba(177, 199, 193, 0.1);
  min-height: 0;
}
.field.grow { flex: 1; min-height: 0; }

.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--mid);
  background: rgba(146, 178, 169, 0.12);
  border: 1px solid rgba(146, 178, 169, 0.4);
  border-radius: var(--radius);
  padding: 4px 5px 4px 9px;
  white-space: nowrap;
}
.chip-x {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: rgba(4, 4, 8, 0.5);
  border: 1px solid var(--hair);
  color: var(--deep);
  cursor: pointer;
}
.chip-x:hover { background: var(--danger); border-color: var(--danger); color: var(--s0); }
.chip-add {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--faint);
  border: 1px dashed rgba(177, 199, 193, 0.24);
  border-radius: var(--radius);
  padding: 4px 9px;
}
.tag-input { width: 76px; font-size: 10.5px; color: var(--ink); }
.tag-input::placeholder { color: var(--faint); }

.counter { font-size: 9px; color: var(--faint); }
.counter.full { color: var(--danger); }
.content {
  flex: 1;
  min-height: 140px;
  resize: none;
  background: var(--field);
  border: 1px solid rgba(177, 199, 193, 0.16);
  border-radius: var(--radius);
  padding: 12px 13px;
  font-size: 13.5px;
  line-height: 1.72;
  color: var(--mid);
}
.content:focus { border-color: var(--focus-border); box-shadow: var(--focus-ring); outline: none; }
.content::placeholder { color: var(--faint); }

/* 빈 상태 */
.blank {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
  text-align: center;
}
.blank h3 { font-size: 22px; color: var(--ink); }
.blank p { font-size: 11px; color: var(--faint); }

@media (max-width: 1240px) {
  .split { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .side { border-left: 0; border-top: 1px solid rgba(177, 199, 193, 0.1); }
  .body { grid-template-columns: 280px 1fr; }
}
/* 모바일 — 데스크탑의 「고정 높이 패널 격자」를 페이지 세로 스크롤 하나로 바꾼다.
   390px 에서는 상단바가 한 줄에 안 들어가 겹치고, min-width:0 인 flex 필드는
   wrap 대신 무한히 찌그러지고, 패널 격자는 서로 파고든다. */
@media (max-width: 900px) {
  /* 상단바를 한 줄로 되돌린다 — 「저장 + ⋯」만 남기고 목록·취소는 메뉴로 접었다.
     펼친 채로 쌓으면 세로 110px 을 먹고 그만큼 편집 영역이 줄어든다. */
  .topbar { height: 56px; gap: 8px; padding: 0 12px; }
  .wide-only { display: none; }
  .top-left { gap: 8px; overflow: hidden; }
  .badge { padding: 4px 7px; }
  .state { font-size: 10px; }
  .err { max-width: 120px; }
  .rule { display: none; }
  .toggle-label { display: none; }
  .top-right .btn { min-height: 40px; }

  /* 포스트 헤더: flex-wrap 은 min-width:0 앞에서 무력하다 — 아예 세로로 쌓는다 */
  .posthead { flex-direction: column; align-items: stretch; gap: 12px; padding: 14px 16px; }
  .field.locked { width: 100%; }
  .input.title { font-size: 18px; }
  .lockbox { flex-wrap: wrap; }

  /* 본문: 격자와 내부 높이 제약을 풀고 페이지가 통째로 스크롤하게 둔다 */
  .body { display: block; min-height: 0; }
  .points {
    /* 포인트가 60개여도 편집 블록에 닿을 수 있어야 한다 — 목록만 따로 스크롤 */
    max-height: 45dvh;
    border-right: 0;
    border-bottom: 1px solid var(--hair);
  }
  .editor, .split { display: block; min-height: 0; }
  .ehead { flex-wrap: wrap; padding: 12px 16px; }
  .grid-col, .side { min-height: 0; padding: 14px 16px; }
  .side { border-left: 0; border-top: 1px solid rgba(177, 199, 193, 0.1); }
  .field.grow { min-height: 0; }
}
</style>
