<script setup lang="ts">
import AppBack from '~/components/AppBack.vue'
import ErrorNote from '~/components/ErrorNote.vue'
import PostSettings from '~/components/PostSettings.vue'
import PointGroupBoard, { type BoardGroup } from '~/components/PointGroupBoard.vue'
import OverflowMenu from '~/components/OverflowMenu.vue'
import BottomCta from '~/components/BottomCta.vue'
import BusyOverlay from '~/components/BusyOverlay.vue'
import PhotoLightbox from '~/components/PhotoLightbox.vue'
import CurrencySelect from '~/components/CurrencySelect.vue'
/**
 * 포스트 편집 — 세 페이즈.
 *   1 기본 정보    타이틀 · 요약 · 공개 · 기간 · 포인트 범위
 *   2 포인트 편집  사진을 포인트별 그룹으로 늘어놓고 끌어서 옮긴다 · 분리 · 삭제 · 포인트 제거
 *   3 기록 편집    포인트별 이름 · 태그 · 본문 · 대표 썸네일
 *
 * 좌표와 촬영 시각은 EXIF 측량값이라 어디서도 고칠 수 없다 (설계문서 §7.2).
 * 포인트 «순서»도 촬영 시각 순 고정이다 — 2단계에서 사진을 옮기면 순서는 따라 움직이지만
 * 손으로 잡아 끌 수는 없다. 지도 동선이 촬영 시각 순이라는 게 이 앱의 근간이다 (§6).
 *
 * 모든 편집은 로컬 초안에 쌓였다가 「저장」에서 한 번에 서버로 나간다 —
 * 그래서 상단바가 「변경 N건 · 저장 안 됨」을 셀 수 있고, 저장 없이 나가면 물어볼 수 있다.
 * 예외는 포인트 범위(재클러스터링) 하나뿐이고, 그건 1단계가 별도 확인을 받는다.
 */
import { onBeforeRouteLeave } from 'vue-router'
import type { Photo, Point, PostDetail } from '#shared/types/db'
// 자동 임포트에 기대지 않는다 — unimport 스캐너가 연속된 `export const` 중 두 번째부터 놓친다
import { formatDateTime } from '#shared/utils/format'
import { pointThumb, vSk } from '~/utils/img'
import { vEnter } from '~/utils/enter'
import PhotoTile from '~/components/PhotoTile.vue'
import { centroid } from '#shared/utils/cluster'
import { sameSpot } from '#shared/utils/geo'
import {
  cleanExpenses, cleanLinks, DEFAULT_CURRENCY, formatMoney, googleMapsUrl, isCurrency,
  MAX_EXPENSES, MAX_ITEM, MAX_LINKS, MAX_URL, totalsOf,
  type CurrencyCode, type PointExpense, type PointLink,
} from '#shared/utils/extras'
import type { DragFrom, DragOver } from '~/composables/useTileDrag'
import { askConfirm } from '~/composables/useConfirm'
import { skipNotice, summarizeSkipped } from '~/utils/exif'
import { usePickMode } from '~/composables/usePickMode'

/**
 * 편집 중의 금액은 «문자열»이다.
 * 숫자로 묶어두면 「12.」 를 치는 도중에 Number('12.') → 12 로 되돌아가 점이 지워지고,
 * 빈 칸은 NaN 이 된다. 저장할 때 한 번만 숫자로 옮긴다 (outExpenses).
 */
interface ExpenseDraft {
  item: string
  amount: string
  currency: CurrencyCode
}

/** 앵커를 무엇으로 잡을지. 좌표는 서버가 이 포인트의 사진에서 직접 계산한다 (§7.2 유지). */
type AnchorPick = 'centroid' | 'cover'

interface PointDraft {
  /** 서버 포인트 id. 🔴 음수면 2단계에서 사진을 끌어내 만든 «아직 없는» 포인트다. */
  id: number
  title: string
  body: string
  tags: string[]
  /** 사진 순서. 삭제 예약한 사진과 다른 포인트로 보낸 사진은 여기서 빠진다. */
  ids: number[]
  /** 대표 썸네일. null 이면 첫 사진 (서버의 규칙과 같다). */
  coverId: number | null
  links: PointLink[]
  expenses: ExpenseDraft[]
  /**
   * 지도에 찍힐 자리를 다시 잡았는가. null 이면 손대지 않은 것이다.
   * 좌표가 아니라 «규칙»을 든다 — 저장 전에 대표 사진을 바꾸면 'cover' 가 그걸 따라간다.
   */
  anchor: AnchorPick | null
}

const MAX_BODY = 2000
const MAX_TAGS = 20
/** 마지막으로 고른 화폐를 기억한다 — 한 여행에서는 대개 같은 화폐로만 적는다 */
const CURRENCY_KEY = 'pic-blog:currency'
/**
 * 3단계에서 한 포인트에 한 번에 붙일 수 있는 사진 수.
 * 2단계의 50장보다 훨씬 작다 — 여기는 「이 자리에 몇 장 더」를 위한 자리이지
 * 기록을 채우는 자리가 아니고, 올리는 동안 화면이 잠기기 때문이다.
 */
const MAX_PER_POINT = 10

definePageMeta({ layout: 'editor' })

const route = useRoute()
const router = useRouter()
const slug = computed(() => String(route.params.slug))

const { data: post, refresh } = await useFetch<PostDetail>(() => `/api/posts/${slug.value}`)

const draftTitle = ref('')
const draftSummary = ref('')
const draftPublic = ref(false)
/** 기간은 날짜만 고른다 (YYYY-MM-DD) — 화면 어디에도 시각까지 쓰는 자리가 없다 */
const draftStart = ref('')
const draftEnd = ref('')
/** 기록 커버 — 2단계 「커버 지정」이 고른 사진. 포인트 대표 썸네일과는 다른 값이다. */
const draftCoverId = ref<number | null>(null)
const pointDrafts = ref<PointDraft[]>([])
/** 삭제 예약. 저장 전까지는 DB 도 디스크도 건드리지 않는다. */
const removedPhotoIds = ref<number[]>([])
const activeId = ref<number | null>(null)
const tagInput = ref('')
const saving = ref(false)
const step = ref<'basic' | 'points' | 'notes'>('basic')

/*
 * 🔴 지금은 «꺼져» 있다. 1단계에 켜봤다가 기기 로그를 보고 껐다.
 *
 *    문서 스크롤은 밀림(sy=-396)을 없앴지만 대신 「자석」을 만들었다. 입력칸에 포커스가
 *    있는 동안 iOS 가 스크롤을 캐럿 자리(sy=68)로 계속 끌어당긴다 — 손으로 0까지 내려도
 *    떼면 68로 돌아온다:
 *
 *      focusIN  sy=132 → 68        (포커스만으로 끌려감)
 *      touch    68 → 60 → 33 → 0   (손으로 내림)
 *               0 → 12 → 63 → 68   (떼면 되돌아옴)
 *
 *    스크롤이 막힌 것은 아니다 — 포커스가 없을 때는 sy=244 까지 자유롭게 간다.
 *    「타이핑 중에는 폼의 나머지를 볼 수 없다」가 밀림 한두 프레임보다 나쁘다.
 *
 *    껍데기 없는 실험 페이지에서는 이 자석이 없었다(캐럿이 화면 밖 -27 까지 나갔다).
 *    무엇이 차이인지는 끝내 못 찾았다 — CTA·스크롤 사슬·문서 길이를 하나씩 지웠지만
 *    남았다. 다시 켜려면 그 차이부터 찾아야 한다.
 *

 * 🔴 3단계에는 «복제하지 않는다». 한 번 넣었다가 기기 로그를 보고 되돌렸다.
 *    3단계는 포인트 목록 + 편집 블록이라 문서가 통째로 길어진다(셸 1162px). 그러면
 *    본문 입력칸이 문서 깊숙이(y≈734) 앉는데, 아이폰은 키보드가 떠 있는 동안 캐럿이
 *    가려지지 않게 스크롤을 «붙들어» 둔다. 그 바닥이 정확히 sy=369(=734−397+여유)였고,
 *    손으로 그 위로 밀면 167까지 갔다가 매번 369 로 되돌아왔다:
 *
 *      touchSTART sy=369 → 353 → 316 → … → 167 → 187 → … → 369 → touchEND sy=369
 *
 *    「스크롤이 더 안 내려간다」가 이것이다. 셸이 고정이면 굴러가는 칸이 짧아 캐럿이
 *    늘 위쪽에 있으므로 이 붙들림이 눈에 띄지 않는다. 문서를 길게 만든 것이 화근이다.
 *
 * 2단계도 그대로 둔다: 헤더·지도가 밀려 올라가면 안 되고, 드래그의 가장자리 자동
 * 스크롤이 「굴러가는 칸」을 찾아 움직이는 구조라(useTileDrag) 문서 스크롤과 섞이면 꼬인다.
 */
useDocScroll(computed(() => false))
const reclustering = ref(false)
/** 삭제 중 — 나가기 확인을 건너뛰게 한다 (기록이 사라졌는데 「저장할까요?」를 물으면 안 된다) */
const deleting = ref(false)
const errorMessage = ref<string | null>(null)
/** 새 포인트의 임시 id — 서버 id 와 절대 겹치지 않게 음수로 센다 */
const nextTempId = ref(-1)
/** 상단바에서 잘린 제목의 전체를 띄우는 판 */
const titleDlg = useTemplateRef<HTMLDialogElement>('titleDlg')

const photoById = computed(
  () => new Map((post.value?.points ?? []).flatMap((p) => p.photos).map((ph) => [ph.id, ph])),
)
const activeDraft = computed(() => pointDrafts.value.find((d) => d.id === activeId.value))
const activeIndex = computed(() => pointDrafts.value.findIndex((d) => d.id === activeId.value))
const activePoint = computed(() => basePoint(activeId.value ?? 0))

function photosOf(ids: readonly number[]): Photo[] {
  return ids.map((id) => photoById.value.get(id)).filter((p): p is Photo => p !== undefined)
}

const activePhotos = computed(() => photosOf(activeDraft.value?.ids ?? []))

/** 2단계 보드가 그릴 그룹들 — 초안을 그대로 편 것이라 보드는 자기 상태를 갖지 않는다 */
const boardGroups = computed<BoardGroup[]>(() =>
  pointDrafts.value.map((d, i) => ({
    id: d.id,
    title: d.title.trim() || (d.id < 0 ? '새 포인트' : `포인트 ${i + 1}`),
    photos: photosOf(d.ids),
    // 고른 규칙까지 반영한 «지금 찍힐» 자리 — 보드가 「지금 어디인지」를 이 값으로 말한다
    anchor: draftAnchor(d),
    coverPhotoId: d.coverId,
  })),
)

/**
 * 지금 기록 커버. 고른 사진이 살아 있으면 그것이고, 아니면 서버 syncPostCover() 와
 * 같은 문장으로 되돌아간다 — 「첫 포인트의 대표 썸네일 → 그 포인트의 첫 사진」.
 * 두 곳이 다른 규칙을 쓰면 저장 직후 화면의 「커버」 배지가 옮겨 다닌다.
 */
const coverId = computed(() => {
  const chosen = draftCoverId.value
  if (chosen !== null && pointDrafts.value.some((d) => d.ids.includes(chosen))) return chosen
  const head = pointDrafts.value.find((d) => d.ids.length)
  if (!head) return null
  return head.coverId !== null && head.ids.includes(head.coverId) ? head.coverId : head.ids[0] ?? null
})

/** 서버 기준 그룹 구성 (삭제 예약을 뺀 것) — 「구성이 바뀌었나」의 기준값 */
function baseIds(pointId: number) {
  return (basePoint(pointId)?.photos ?? [])
    .map((ph) => ph.id)
    .filter((id) => !removedPhotoIds.value.includes(id))
}

/** 사진의 소속·순서가 서버와 달라졌는가 — 달라졌으면 regroup 을 보낸다 */
const structuralChanges = computed(() => {
  const p = post.value
  if (!p) return 0
  let n = removedPhotoIds.value.length
  n += pointDrafts.value.filter((d) => d.id < 0).length
  n += p.points.filter((pt) => !pointDrafts.value.some((d) => d.id === pt.id)).length
  n += pointDrafts.value.filter(
    (d) => d.id > 0 && d.ids.join(',') !== baseIds(d.id).join(','),
  ).length
  return n
})

const changes = computed(() => {
  const p = post.value
  if (!p) return 0
  let n = structuralChanges.value
  if (draftTitle.value.trim() !== p.title) n++
  if (draftSummary.value.trim() !== (p.summary ?? '')) n++
  if (draftPublic.value !== p.is_public) n++
  if (draftStart.value !== dateOf(p.started_at) || draftEnd.value !== dateOf(p.ended_at)) n++
  if (coverId.value !== p.cover_photo_id) n++
  for (const d of pointDrafts.value) {
    const base = basePoint(d.id)
    if (!base) continue
    if (d.title.trim() !== (base.title ?? '')) n++
    if (d.body.trim() !== (base.body ?? '')) n++
    if (d.tags.join('\n') !== base.tags.join('\n')) n++
    if (d.coverId !== base.cover_photo_id) n++
    if (!sameLinks(d, base)) n++
    if (!sameExpenses(d, base)) n++
    if (anchorMoved(d)) n++
  }
  return n
})

hydrate()

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onSaveKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onSaveKey)
})

onBeforeRouteLeave(async () => {
  if (deleting.value || changes.value === 0) return true
  return askConfirm({
    title: '저장하지 않고 나갈까요?',
    body: `변경 ${changes.value}건이 저장되지 않았습니다. 나가면 사라집니다.`,
    confirmLabel: '저장하지 않고 나가기',
    danger: true,
  })
})

/** 서버 응답을 초안으로 되돌린다. 최초 진입 · 저장 직후 · 「취소」가 모두 이걸 부른다. */
function hydrate() {
  const p = post.value
  removedPhotoIds.value = []
  errorMessage.value = null
  tagInput.value = ''
  nextTempId.value = -1
  if (!p) {
    pointDrafts.value = []
    return
  }
  draftTitle.value = p.title
  draftSummary.value = p.summary ?? ''
  draftPublic.value = p.is_public
  draftStart.value = dateOf(p.started_at)
  draftEnd.value = dateOf(p.ended_at)
  draftCoverId.value = p.cover_photo_id
  pointDrafts.value = p.points.map((pt) => ({
    id: pt.id,
    title: pt.title ?? '',
    body: pt.body ?? '',
    tags: [...pt.tags],
    ids: pt.photos.map((ph) => ph.id),
    coverId: pt.cover_photo_id,
    links: pt.links.map((l) => ({ ...l })),
    expenses: pt.expenses.map((e) => ({ ...e, amount: String(e.amount) })),
    anchor: null,
  }))
  if (!pointDrafts.value.some((d) => d.id === activeId.value)) {
    activeId.value = pointDrafts.value[0]?.id ?? null
  }
}

/** '2026-08-23T18:35:39' → '2026-08-23' (date 입력이 먹는 형태) */
function dateOf(iso: string | null) {
  return iso ? iso.slice(0, 10) : ''
}

/**
 * 날짜 입력 → 서버가 받는 벽시계 문자열.
 * 날짜를 건드리지 않았으면 원본을 그대로 돌려준다 — 안 그러면 저장할 때마다
 * EXIF 의 시·분·초가 00:00:00 으로 깎여 나간다.
 */
function periodOut(date: string, base: string | null, endOfDay: boolean) {
  if (!date) return null
  if (base && base.slice(0, 10) === date) return base
  return `${date}T${endOfDay ? '23:59:59' : '00:00:00'}`
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

/**
 * 초안을 촬영 시각 순으로 다시 세운다 — 저장 뒤 서버가 매길 순서를 미리 그대로 보여준다.
 * 정렬 규칙은 regroup 엔드포인트와 같아야 한다: 시각 없는 포인트는 뒤로, 동률은 id 순.
 * 새 포인트(음수 id)는 INSERT 로 가장 큰 id 를 받으므로 동률에서 맨 뒤에 선다.
 */
function resort() {
  const key = (d: PointDraft) => {
    const times = photosOf(d.ids).map((p) => p.shot_at).filter((t): t is string => t !== null).sort()
    return { t: times[0] ?? null, id: d.id < 0 ? 1e12 - d.id : d.id }
  }
  pointDrafts.value = [...pointDrafts.value].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka.t === null || kb.t === null) {
      if (ka.t !== kb.t) return ka.t === null ? 1 : -1
    } else if (ka.t !== kb.t) {
      return ka.t < kb.t ? -1 : 1
    }
    return ka.id - kb.id
  })
}

/**
 * 마지막 사진이 빠져나가면 포인트도 함께 사라진다 — 그 순간은 «언제나» 물어본다.
 *
 * 예전엔 이름·태그·본문이 있을 때만 물었는데, 아무것도 안 적힌 포인트라도 사라지는 건
 * 사라지는 것이다. 사진 한 장을 옮기거나 지웠을 뿐인데 지도에서 포인트가 통째로
 * 없어지면 그건 예고 없는 결과다 (설계문서 §8 — 조용한 실패 금지).
 */
function confirmVanish(d: PointDraft, how: '옮기면' | '지우면') {
  const name = d.title.trim() || '이름 없는 포인트'
  const lost: string[] = []
  if (d.title.trim()) lost.push('이름')
  if (d.tags.length) lost.push(`태그 ${d.tags.length}개`)
  if (d.body.trim()) lost.push(`본문 ${d.body.trim().length}자`)
  if (outLinks(d).length) lost.push(`링크 ${outLinks(d).length}개`)
  if (outExpenses(d).length) lost.push(`소비 기록 ${outExpenses(d).length}건`)
  const tail = lost.length ? ` 적어둔 ${lost.join(' · ')} 도 함께 없어집니다.` : ''
  return askConfirm({
    title: `「${name}」 포인트가 사라집니다`,
    body: `이 포인트의 마지막 사진입니다. ${how} 포인트가 지도에서 없어집니다.${tail}`,
    confirmLabel: how === '옮기면' ? '옮기기' : '사진 지우기',
    danger: true,
  })
}

function dropDraft(id: number) {
  pointDrafts.value = pointDrafts.value.filter((d) => d.id !== id)
  if (activeId.value === id) activeId.value = pointDrafts.value[0]?.id ?? null
}

/** 2단계 — 사진 한 장이 어디에서 어디로 */
/**
 * 「시각 순 정렬」 — 한 포인트 안의 사진 순서만 바꾼다.
 *
 * 🔴 resort() 를 부르지 않는다. 포인트의 정렬 키는 «가장 이른» 사진 시각이라(resort 의
 *    times[0]) 그룹 «안»의 순서를 바꿔도 그 값은 그대로다. 괜히 부르면 아무 이유 없이
 *    목록 전체가 다시 늘어선다.
 *
 * 시각이 없는 사진은 뒤로 몰되 서로의 순서는 건드리지 않는다 — 지어낸 시각으로
 * 줄을 세우면 사람이 손으로 잡아둔 배치가 조용히 흐트러진다.
 */
function onSortPhotos(groupId: number) {
  const d = pointDrafts.value.find((x) => x.id === groupId)
  if (!d) return
  const at = new Map(photosOf(d.ids).map((p) => [p.id, p.shot_at]))
  d.ids = d.ids
    .map((id, i) => ({ id, t: at.get(id) ?? null, i }))
    .sort((a, b) => {
      if (a.t === b.t) return a.i - b.i
      if (a.t === null) return 1
      if (b.t === null) return -1
      return a.t < b.t ? -1 : 1
    })
    .map((x) => x.id)
}

async function onBoardDrop(from: DragFrom, over: DragOver) {
  const src = pointDrafts.value.find((d) => d.id === from.groupId)
  if (!src) return
  if (src.ids.indexOf(from.photoId) < 0) return

  // 새 포인트로 분리 — 혼자 남은 사진을 떼어내는 건 제자리 놓기라 아무 일도 하지 않는다
  if (over.groupId === null) {
    if (src.ids.length <= 1) return
    src.ids.splice(src.ids.indexOf(from.photoId), 1)
    if (src.coverId === from.photoId) src.coverId = null
    pointDrafts.value.push({
      id: nextTempId.value--,
      title: '',
      body: '',
      tags: [],
      ids: [from.photoId],
      coverId: null,
      links: [],
      expenses: [],
      anchor: null,
    })
    resort()
    return
  }

  // 같은 그룹 안 = 순서 바꾸기. 자기 자리를 빼고 나면 뒤쪽 인덱스가 하나씩 당겨진다.
  if (over.groupId === src.id) {
    const at = src.ids.indexOf(from.photoId)
    const to = over.index > at ? over.index - 1 : over.index
    if (to === at) return
    src.ids.splice(at, 1)
    src.ids.splice(to, 0, from.photoId)
    return
  }

  const dst = pointDrafts.value.find((d) => d.id === over.groupId)
  if (!dst) return
  // 🔴 물어보는 동안 화면이 멈춰 있지만, 자리는 답을 받은 «뒤에» 다시 찾는다 —
  //    await 앞에서 잡아둔 인덱스를 그대로 쓰면 조용히 엉뚱한 사진을 옮기게 된다.
  if (src.ids.length === 1 && !(await confirmVanish(src, '옮기면'))) return
  const at = src.ids.indexOf(from.photoId)
  if (at < 0) return

  src.ids.splice(at, 1)
  if (src.coverId === from.photoId) src.coverId = null
  dst.ids.splice(over.index, 0, from.photoId)
  if (!src.ids.length) dropDraft(src.id)
  resort()
}

async function onRemovePhoto(id: number) {
  const d = pointDrafts.value.find((x) => x.ids.includes(id))
  if (!d) return
  if (d.ids.length === 1) {
    // 기록에 사진이 한 장도 없으면 저장할 구성 자체가 없다 (regroup 이 400 으로 막는다)
    if (pointDrafts.value.length === 1) {
      errorMessage.value = '기록의 마지막 사진은 지울 수 없습니다'
      return
    }
    if (!(await confirmVanish(d, '지우면'))) return
    if (!d.ids.includes(id)) return
  }
  d.ids = d.ids.filter((x) => x !== id)
  if (d.coverId === id) d.coverId = null
  // 지운 사진이 기록 커버였으면 지정을 푼다 — 아래 coverId 가 규칙대로 다시 고른다
  if (draftCoverId.value === id) draftCoverId.value = null
  if (!removedPhotoIds.value.includes(id)) removedPhotoIds.value.push(id)
  if (!d.ids.length) dropDraft(d.id)
  resort()
}

function onAddPhotos() {
  // 라우트 중첩 충돌을 피해 /editor/add/[slug] 로 둔다 ([slug].vue 가 부모 라우트가 되면 편집 화면이 깨진다)
  void router.push(`/editor/add/${slug.value}`)
}

/** 2단계 — 기록 커버 지정 (목록 카드에 뜨는 한 장) */
function onPickCover(id: number) {
  draftCoverId.value = id
}

/**
 * 3단계 — 그 «포인트»의 대표 썸네일 고르는 중.
 *
 * 2단계의 「커버 지정」과 같은 모드다. 사진을 그냥 누르는 것은 «크게 보기»여야 하고,
 * 상시로 「클릭 = 대표」면 확인하려고 누른 순간 대표가 바뀐다.
 */
const thumbPicking = usePickMode()

/**
 * 3단계 사진 클릭 — 고르는 중이면 대표로, 아니면 크게 본다.
 *
 * 🔴 「다시 누르면 지정 해제」를 없앴다. 해제하면 coverId 가 null 이 되고 화면은
 *    「첫 사진」으로 되돌아가는데, 사용자에게는 그것도 그냥 대표 사진이라 「기본」과
 *    「대표」를 나눠 보여줄 이유가 없었다. 첫 사진으로 되돌리고 싶으면 첫 사진을 고른다.
 */
function onPickClick(index: number, photoId: number) {
  const d = activeDraft.value
  if (!d) return
  if (!thumbPicking.value) {
    onOpenPhoto(d.id, index)
    return
  }
  thumbPicking.value = false
  d.coverId = photoId
}

/** 포인트를 옮기면 고르던 것은 끝난다 — 다른 포인트의 사진에 그대로 이어지면 놀란다 */
function selectPoint(id: number) {
  thumbPicking.value = false
  activeId.value = id
}

/* ── 2단계 · 포인트 칸에서 사진 붙이기 ─────────────────────────────────────
 * 상단의 「사진 추가」는 반경으로 배정한다. 여기는 그 반대다 — 고른 사진이 좌표와
 * 무관하게 «누른 칸의 포인트»로 들어간다. 거리로는 안 묶이는 것을 맥락으로 묶으려면
 * 그 길이 필요하다.
 */
const addTargetId = ref<number | null>(null)
const pointAddFlow = useAddPhotosFlow(slug, computed(() => post.value?.points ?? []), {
  pointId: addTargetId,
  limit: MAX_PER_POINT,
  // 「전부 취소」가 서버의 기간 재계산까지 되돌리려면 붙이기 전 값이 필요하다
  period: computed(() => (post.value ? { started_at: post.value.started_at, ended_at: post.value.ended_at } : null)),
})
const pointAddInput = useTemplateRef<HTMLInputElement>('pointAddInput')
const pointAddBusy = computed(() =>
  // loading = 껍데기가 사진첩에서 원본을 꺼내는 구간. 여기도 바쁜 상태다.
  pointAddFlow.stage.value === 'loading'
  || pointAddFlow.stage.value === 'scanning'
  || pointAddFlow.stage.value === 'uploading',
)

/**
 * 못 붙이는 이유. 없으면 null.
 * 🔴 「저장 안 된 변경이 있으면 막는다」를 쓰지 않는다. 2단계는 «구조를 바꾸는» 화면이라
 *    드래그를 한 번만 해도 그 조건이 켜져서 기능이 거의 늘 잠긴다. 대신 아래 onPointAdd
 *    가 hydrate() 로 초안을 갈아엎지 않고 새 사진만 초안에 «이어 붙인다».
 */
const pointAddBlocked = computed(() =>
  saving.value ? '저장 중입니다' : null,
)

/** 제외된 사진 안내 — 템플릿에서 두 번(v-if 와 보간) 부르지 않도록 여기서 한 번 만든다 */
const pointAddNotice = computed(() => skipNotice(pointAddFlow.skipped.value, MAX_PER_POINT))

/**
 * 어느 그룹에 붙일지 정하고 바로 고르게 한다.
 * 🔴 pickPhotos 앞에 await 를 두면 안 된다 — 사용자 제스처 안에서 선택기가 열려야
 *    사파리가 막지 않는다 (껍데기 경로는 네이티브 피커라 무관하지만 웹 경로가 그렇다).
 */
function onAddToPoint(groupId: number) {
  const d = pointDrafts.value.find((x) => x.id === groupId)
  if (!d || d.id < 0 || pointAddBlocked.value) return
  addTargetId.value = groupId
  errorMessage.value = null
  // flow.pick 이 고르기와 검사를 이어서 한다 — 그 안에서 진행률도 흐른다
  void onPointAdd(pointAddFlow.pick(pointAddInput.value))
}

async function onPointAdd(picking: Promise<void>) {
  await picking

  const targetId = addTargetId.value
  const d = targetId === null ? null : pointDrafts.value.find((x) => x.id === targetId)
  if (!d) return

  if (!pointAddFlow.scanned.value.length) {
    // 아무것도 안 고르고 닫았으면 조용히 끝낸다 — 고른 게 있었는데 전부 걸러졌을 때만 사유를 말한다
    //
    // 조치가 있는 사유면 그 줄을 그대로 쓴다. 개수와 「올릴 수 없다」가 이미 그 안에 있고,
    // 바로 아래 reset() 이 skipped 를 비우므로 화면의 안내줄(pointAddNotice)은 뜨지 못한다 —
    // 이 자리가 조치를 말할 «유일한» 자리다.
    if (pointAddFlow.skipped.value.length) {
      errorMessage.value = pointAddNotice.value
        ?? `올릴 사진이 없습니다 — ${summarizeSkipped(pointAddFlow.skipped.value)}`
    }
    pointAddFlow.reset()
    return
  }
  await pointAddFlow.confirm()
  if (pointAddFlow.errorMessage.value) {
    errorMessage.value = pointAddFlow.errorMessage.value
    return
  }
  // 부분 실패를 여기서 매듭짓는다 — 안 그러면 바이트 없는 사진이 조용히 초안에 섞인다
  if (!(await settlePointAdd())) return

  /*
   * 🔴 hydrate() 를 부르지 않는다 — 그건 초안을 통째로 서버 값으로 되돌려 여기까지 한
   *    편집(드래그·이름·태그…)을 다 지운다. 서버가 새로 만든 사진만 골라 이어 붙인다.
   *    「새로 생긴 것」은 초안 어디에도 없고 삭제 예약도 아닌 id 다.
   */
  const prevStart = dateOf(post.value?.started_at ?? null)
  const prevEnd = dateOf(post.value?.ended_at ?? null)
  const periodUntouched = draftStart.value === prevStart && draftEnd.value === prevEnd

  await refresh()

  const known = new Set([...pointDrafts.value.flatMap((x) => x.ids), ...removedPhotoIds.value])
  const fresh = (basePoint(d.id)?.photos ?? []).map((ph) => ph.id).filter((id) => !known.has(id))
  d.ids.push(...fresh)

  /*
   * 기간은 서버가 새 사진까지 넣어 다시 계산한다 (photos 엔드포인트). 사용자가 손대지
   * 않았을 때만 그 값을 따라간다 — 손으로 고쳐둔 값을 조용히 덮어쓰지 않는다.
   */
  if (periodUntouched) {
    draftStart.value = dateOf(post.value?.started_at ?? null)
    draftEnd.value = dateOf(post.value?.ended_at ?? null)
  }

  // 더 이른 사진이 들어오면 포인트 순서가 바뀐다 — 서버와 같은 규칙으로 다시 세운다
  resort()
  addTargetId.value = null
}

/**
 * 이 경로의 부분 실패 출구.
 *
 * 1f(사진 추가)에는 진행 화면이 있어 「재시도 / 전부 취소」를 버튼으로 내지만, 여기는
 * 오버레이 하나뿐이라 그 몫을 확인 다이얼로그가 맡는다. 출구는 같은 둘이다 — 다시 하거나,
 * 없던 일로. 「그냥 두기」는 없다: 바이트가 안 온 사진 행을 남기면 초안에 깨진 이미지가
 * 섞이고, 저장하는 순간 그게 기록에 굳는다 (예전에는 여기서 아무 말도 안 했다).
 *
 * 돌려주는 값 = 계속 진행해도 되는가(= 붙은 사진을 초안에 이어 붙일 것인가).
 */
async function settlePointAdd() {
  while (pointAddFlow.failed.value.length) {
    const again = await askConfirm({
      title: `사진 ${pointAddFlow.failed.value.length}장이 올라가지 않았습니다`,
      body: '다시 시도하지 않으면 이번에 붙인 사진을 전부 되돌립니다 (이미 올라간 것 포함).',
      confirmLabel: '다시 시도',
      cancelLabel: '전부 취소',
    })
    if (!again) {
      const n = pointAddFlow.totalPhotos.value
      await pointAddFlow.cancelUpload()
      pointAddFlow.reset()
      addTargetId.value = null
      // 되돌린 «결과»를 적어둔다 — 다이얼로그는 사라지고 화면은 아무 일도 없던 것처럼 보인다
      errorMessage.value = `사진이 올라가지 않아 ${n}장을 전부 되돌렸습니다`
      return false
    }
    await pointAddFlow.retryFailed()
  }
  return true
}

/** 지정이 없을 때 실제로 쓰이는 사진 — 3단계 픽커가 「기본」 표시를 붙일 자리 */
const activeThumbId = computed(() => {
  const d = activeDraft.value
  if (!d) return null
  return d.coverId !== null && d.ids.includes(d.coverId) ? d.coverId : d.ids[0] ?? null
})

/** 3단계 목록 행의 썸네일 — 지정이 없으면 그 포인트의 첫 사진 (지도 마커와 같은 규칙) */
function rowThumb(draftId: number) {
  const d = pointDrafts.value.find((x) => x.id === draftId)
  if (!d) return null
  return pointThumb({ cover_photo_id: d.coverId, photos: photosOf(d.ids) })
}

/* ── 기타 정보 (링크 · 소비 금액) ───────────────────────────────────────────
 * 서버로 나가는 형태로 옮기는 길은 이 두 함수뿐이다. 「변경 N건」도 저장도 같은 값을
 * 보고 판단해야 저장한 뒤에 건수가 0 이 된다 (extras.ts cleanLinks 의 🔴).
 */
function outLinks(d: PointDraft) {
  return cleanLinks(d.links)
}

function outExpenses(d: PointDraft): PointExpense[] {
  return cleanExpenses(
    // 자릿수 쉼표를 찍는 사람이 있다 — 숫자로 옮기기 전에 걷어낸다
    d.expenses.map((e) => ({ item: e.item, amount: Number(e.amount.replace(/,/g, '')), currency: e.currency })),
  )
}

/** 서버 값과 같은가. 두 쪽이 키를 같은 순서로 만들어서 문자열 비교로 충분하다 (__checks.ts 가 지킨다). */
function sameLinks(d: PointDraft, base: Point) {
  return JSON.stringify(outLinks(d)) === JSON.stringify(base.links)
}

function sameExpenses(d: PointDraft, base: Point) {
  return JSON.stringify(outExpenses(d)) === JSON.stringify(base.expenses)
}

function addLink() {
  const d = activeDraft.value
  if (!d || d.links.length >= MAX_LINKS) return
  d.links.push({ label: '', url: '' })
}

/** 🔴 포인트 앵커가 아니라 «대표 사진»의 좌표다 — 앵커는 사진들의 평균이라 실제로 간 자리가 아니다 */
const mapLink = computed(() => {
  const id = activeThumbId.value
  const ph = id === null ? undefined : photoById.value.get(id)
  return ph ? googleMapsUrl(ph.lat, ph.lng) : null
})

/** 이미 같은 링크가 있으면 버튼을 잠근다 — 눌러도 아무 일이 없는 버튼은 고장으로 읽힌다 */
const mapLinkExists = computed(() => {
  const url = mapLink.value
  const d = activeDraft.value
  return !!url && !!d && d.links.some((l) => l.url.trim() === url)
})

function addMapLink() {
  const d = activeDraft.value
  const url = mapLink.value
  if (!d || !url || mapLinkExists.value || d.links.length >= MAX_LINKS) return
  d.links.push({ label: '구글 지도', url })
}

function lastCurrency(): CurrencyCode {
  try {
    const v = localStorage.getItem(CURRENCY_KEY)
    if (v && isCurrency(v)) return v
  } catch {
    // 사파리 비공개 모드 등 — 기억을 못 할 뿐이라 기본값으로 간다
  }
  return DEFAULT_CURRENCY
}

function rememberCurrency(c: CurrencyCode) {
  try {
    localStorage.setItem(CURRENCY_KEY, c)
  } catch {
    // 위와 같다
  }
}

function addExpense() {
  const d = activeDraft.value
  if (!d || d.expenses.length >= MAX_EXPENSES) return
  d.expenses.push({ item: '', amount: '', currency: lastCurrency() })
}

/** 숫자로 안 읽히는 금액은 표시로 알린다 — 저장할 때 조용히 0 이 되면 안 된다 */
function badAmount(e: ExpenseDraft) {
  const t = e.amount.replace(/,/g, '').trim()
  return t !== '' && !(isFinite(Number(t)) && Number(t) >= 0)
}

/** 편집 중에도 합계를 보여준다 — 화폐가 섞이면 화폐마다 한 줄 */
const activeTotals = computed(() => (activeDraft.value ? totalsOf(outExpenses(activeDraft.value)) : []))

/* ── 포인트 자리 (앵커) ────────────────────────────────────────────────────
 * 기본은 사진들의 평균이고 만들어질 때 한 번 정해진다. 거리로 안 묶이는 것을 맥락으로
 * 묶으면 평균이 아무도 안 간 중간에 찍히므로, 2단계에서 대표 사진 자리로 옮길 수 있다.
 * 좌표는 서버가 계산한다 — 여기서는 «무엇으로 잡을지»만 들고 미리보기를 그린다.
 */

/** 그 포인트의 대표 사진 — 지정이 없으면 첫 사진 (지도 마커와 같은 규칙) */
function coverPhotoOf(d: PointDraft) {
  const photos = photosOf(d.ids)
  return photos.find((p) => p.id === d.coverId) ?? photos[0] ?? null
}

/** 고른 규칙이 가리키는 자리. 안 골랐으면 지금 서버에 저장된 자리다. */
function draftAnchor(d: PointDraft) {
  if (d.anchor === 'centroid') {
    const photos = photosOf(d.ids)
    return photos.length ? centroid(photos) : null
  }
  if (d.anchor === 'cover') {
    const p = coverPhotoOf(d)
    return p ? { lat: p.lat, lng: p.lng } : null
  }
  const base = basePoint(d.id)
  if (base) return { lat: base.lat, lng: base.lng }
  // 아직 저장 안 된 포인트 — 저장될 값(사진 평균)을 미리 보여준다
  const photos = photosOf(d.ids)
  return photos.length ? centroid(photos) : null
}

/** 자리가 실제로 «움직였는가». 이미 그 자리를 고른 것은 변경이 아니다. */
function anchorMoved(d: PointDraft) {
  if (!d.anchor) return false
  const now = draftAnchor(d)
  const base = basePoint(d.id)
  const photos = photosOf(d.ids)
  const from = base
    ? { lat: base.lat, lng: base.lng }
    : (photos.length ? centroid(photos) : null)
  if (!now || !from) return false
  return !sameSpot(from, now)
}

/** 3단계 헤더에 뜨는 좌표 — 2단계에서 자리를 다시 잡았으면 그 값이 먼저다 */
const activeSpot = computed(() => (activeDraft.value ? draftAnchor(activeDraft.value) : null))

/** 2단계 — 이 포인트를 어느 자리에 찍을지 */
function onSetAnchor(groupId: number, kind: AnchorPick) {
  const d = pointDrafts.value.find((x) => x.id === groupId)
  if (d) d.anchor = kind
}

/*
 * 2단계 라이트박스 — 칸을 누르면 사진을 크게 본다.
 * 공개 화면과 «같은» PhotoLightbox 를 쓴다. 다만 앞뒤 포인트 이름을 주지 않아서
 * (prev/next = null) 그 포인트의 사진 안에서만 좌우로 움직인다 — 편집 중에는
 * 지금 보고 있는 묶음을 확인하는 게 목적이지 기록 전체를 훑는 게 아니다.
 */
const lightbox = ref<{ groupId: number; index: number } | null>(null)

const lightboxPhotos = computed(() => {
  const d = lightbox.value && pointDrafts.value.find((x) => x.id === lightbox.value!.groupId)
  return d ? photosOf(d.ids) : []
})

const lightboxName = computed(() => {
  const id = lightbox.value?.groupId
  const i = pointDrafts.value.findIndex((d) => d.id === id)
  if (i < 0) return ''
  return pointDrafts.value[i]!.title.trim() || `포인트 ${i + 1}`
})

function onOpenPhoto(groupId: number, index: number) {
  lightbox.value = { groupId, index }
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

async function revert() {
  if (!changes.value) return
  const ok = await askConfirm({
    title: '변경을 되돌릴까요?',
    body: `저장하지 않은 변경 ${changes.value}건이 서버에 저장된 상태로 돌아갑니다.`,
    confirmLabel: '되돌리기',
    danger: true,
  })
  if (ok) hydrate()
}

/**
 * 반경 변경 — 다른 편집과 달리 즉시 서버로 나간다. 2·3단계가 편집할 포인트 자체가
 * 갈리기 때문에 초안에 담아둘 수가 없다. 확인은 PostSettings 의 다이얼로그가 이미 받았다.
 */
async function recluster(radius: number) {
  if (reclustering.value || changes.value) return
  reclustering.value = true
  errorMessage.value = null
  try {
    await $fetch(`/api/posts/${slug.value}/recluster`, { method: 'POST', body: { radius } })
    await refresh()
    // 포인트가 통째로 갈렸으므로 초안과 선택을 새 데이터로 다시 세운다
    hydrate()
  } catch (e) {
    errorMessage.value = reason(e)
  } finally {
    reclustering.value = false
  }
}

/** 기록 삭제 — 포인트·사진까지 통째로. 확인을 받고 목록으로 나간다. */
async function removePost() {
  const p = post.value
  if (!p || deleting.value) return
  const ok = await askConfirm({
    title: `「${p.title}」을 삭제할까요?`,
    body: `포인트 ${p.point_count}개와 사진 ${p.photo_count}장이 함께 지워집니다. 되돌릴 수 없습니다.`,
    confirmLabel: '삭제',
    danger: true,
  })
  if (!ok) return

  deleting.value = true
  errorMessage.value = null
  try {
    await $fetch(`/api/posts/${slug.value}`, { method: 'DELETE' })
    await navigateTo('/editor')
  } catch (e) {
    deleting.value = false
    errorMessage.value = reason(e)
  }
}

async function save() {
  const p = post.value
  if (!p || saving.value || !changes.value) return
  if (!draftTitle.value.trim()) {
    errorMessage.value = '포스트 타이틀은 비울 수 없습니다'
    return
  }
  if (draftStart.value && draftEnd.value && draftStart.value > draftEnd.value) {
    errorMessage.value = '기간의 시작이 종료보다 늦습니다'
    return
  }

  saving.value = true
  errorMessage.value = null
  try {
    /**
     * 1) 포인트 구성이 먼저다. 사진 삭제 · 이동 · 분리 · 포인트 제거가 한 트랜잭션으로 나가고,
     *    새 포인트의 서버 id 를 여기서 받아온다 — 2단계에서 만든 포인트에 3단계에서
     *    이름을 달았다면 그 id 를 알아야 아래 PATCH 를 보낼 수 있다.
     */
    if (structuralChanges.value) {
      const res = await $fetch<{ pointIds: number[] }>(`/api/posts/${slug.value}/regroup`, {
        method: 'POST',
        body: {
          groups: pointDrafts.value.map((d) => ({ id: d.id > 0 ? d.id : null, photoIds: d.ids })),
          deletePhotoIds: removedPhotoIds.value,
        },
      })
      /*
       * 🔴 받은 즉시 초안의 id 를 서버 id 로 바꾼다. 음수 id 를 그대로 두면 아래 PATCH 중
       *    하나가 실패했을 때 사용자가 「저장」을 다시 눌렀을 때 regroup 이 또 「새 포인트」로
       *    읽어서 같은 포인트를 한 번 더 만든다. 삭제 예약도 이미 서버에 반영됐으므로 비운다.
       */
      pointDrafts.value.forEach((d, i) => {
        const real = res.pointIds[i]
        if (real === undefined || real === d.id) return
        if (activeId.value === d.id) activeId.value = real
        d.id = real
      })
      removedPhotoIds.value = []
    }

    // 2) 포인트별 기록. 방금 만들어진 포인트는 서버에 이름이 없으니 base 가 null 이다.
    for (const d of pointDrafts.value) {
      const base = basePoint(d.id)
      const dirty =
        !base ||
        d.title.trim() !== (base.title ?? '') ||
        d.body.trim() !== (base.body ?? '') ||
        d.tags.join('\n') !== base.tags.join('\n') ||
        d.coverId !== base.cover_photo_id ||
        !sameLinks(d, base) ||
        !sameExpenses(d, base) ||
        anchorMoved(d)
      // 새 포인트인데 적은 것이 하나도 없으면 보낼 것도 없다
      if (!dirty) continue
      if (
        !base && !d.title.trim() && !d.body.trim() && !d.tags.length && d.coverId === null
        && !outLinks(d).length && !outExpenses(d).length && !anchorMoved(d)
      ) continue
      await $fetch(`/api/points/${d.id}`, {
        method: 'PATCH',
        body: {
          title: d.title.trim() || null,
          body: d.body.trim() || null,
          tags: d.tags,
          cover_photo_id: d.coverId,
          links: outLinks(d),
          expenses: outExpenses(d),
          // 'cover' 는 여기서 실제 사진 id 로 굳힌다 — 서버가 그 사진의 좌표를 쓴다
          anchor: !anchorMoved(d)
            ? null
            : d.anchor === 'centroid'
              ? 'centroid'
              : { photoId: coverPhotoOf(d)?.id ?? null },
        },
      })
    }

    // 3) 포스트가 마지막이다 — 커버는 구성이 확정된 뒤라야 「그 사진이 아직 있는지」가 맞는다
    await $fetch(`/api/posts/${slug.value}`, {
      method: 'PATCH',
      body: {
        title: draftTitle.value.trim(),
        summary: draftSummary.value.trim() || null,
        is_public: draftPublic.value,
        started_at: periodOut(draftStart.value, p.started_at, false),
        ended_at: periodOut(draftEnd.value, p.ended_at, true),
        cover_photo_id: coverId.value,
      },
    })

    await refresh()
    hydrate()
  } catch (e) {
    errorMessage.value = reason(e)
  } finally {
    saving.value = false
  }
}

/**
 * ⌘S · Ctrl+S 로 저장. 데스크탑에서는 본문·태그를 길게 고치다가 저장 버튼까지
 * 손을 올리는 왕복이 잦다.
 *
 * 브라우저의 「페이지 저장」을 반드시 막아야 한다 — 안 막으면 다운로드 창이 뜬다.
 * 저장할 게 없을 때(변경 0건·저장 중)도 막는다: 눌렀는데 다운로드 창이 뜨는 쪽이
 * 아무 일도 안 일어나는 것보다 나쁘다. save() 가 그 조건을 이미 스스로 본다.
 */
function onSaveKey(e: KeyboardEvent) {
  if (e.key !== 's' || !(e.metaKey || e.ctrlKey) || e.altKey) return
  e.preventDefault()
  void save()
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!changes.value) return
  // 최신 브라우저는 preventDefault 만 본다 (returnValue 는 폐기된 경로다)
  e.preventDefault()
}
</script>

<template>
  <div class="page">
    <!--
      헤더는 모바일/데스크탑을 나눠서 그린다. 같은 마크업을 미디어쿼리로 눌러 담으면
      모바일이 「데스크탑을 찌그러뜨린 것」이 된다 — 실제로 배지·상태문구·공개토글·저장이
      56px 한 줄에 다 들어가 어색했다.

      모바일에서 뺀 것들은 사라진 게 아니라 원래 자리로 갔다:
        저장 · 변경 건수  → 하단 CTA (엄지가 닿는 곳)
        공개 토글         → 1단계 「기본 정보」
      그래서 모바일 헤더는 [뒤로] [무엇을 편집 중인지] [부가 메뉴] 셋만 남는다.
    -->
    <header class="topbar">
      <!-- 데스크탑 -->
      <div class="hd-desktop">
        <div class="top-left">
          <!--
            ← 목록으로. 예전엔 「편집 중」 배지가 이 자리에 있었는데, 누를 수 없는 것이
            헤더에서 유일하게 버튼처럼 생겨 있었다. 나가는 길은 오른쪽 「목록」 버튼이
            맡고 있었지만 그건 헤더 오른쪽을 한 칸 더 먹었다 — 왼쪽 ← 하나로 합친다.
          -->
          <AppBack fallback="/editor" label="기록 목록으로" always />
          <!--
            무엇을 편집 중인지가 먼저다. 예전엔 정작 «기록 이름»이 없었다 —
            2·3단계로 넘어가면 타이틀 입력도 안 보여서 어느 기록을 열어둔 건지
            화면 어디에도 안 적혀 있었다.
          -->
          <h1 class="hd-title">
            <button type="button" class="hd-title-btn" data-testid="editor-title-open-wide" @click="titleDlg?.showModal()">
              <span class="hd-title-text">{{ draftTitle || '기록 편집' }}</span>
            </button>
          </h1>
          <ErrorNote class="err" :message="errorMessage" @close="errorMessage = null" />
        </div>

        <div class="top-right">
          <!--
            공개 토글은 여기 없다 — 1단계 「기본 정보」에 같은 스위치가 있다.
            한 값을 두 자리에서 만지면 어느 쪽이 진짜인지 알 수 없다.
            되돌릴 수 없는 것(기록 삭제)은 메뉴 안이다. 저장 옆에 두면 손이 미끄러진다.
          -->
          <OverflowMenu label="기록 메뉴" always testid="editor-menu-wide">
            <DropdownMenuItem class="ovf-item" :disabled="!changes" @select="revert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4 -4l4 -4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></svg>
              변경 취소
              <span class="ovf-state">{{ changes ? `${changes}건` : '없음' }}</span>
            </DropdownMenuItem>
            <DropdownMenuItem as-child class="ovf-item">
              <NuxtLink :to="`/p/${slug}`">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6s-6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6s6.6 2 9 6" /></svg>
                공개 화면 보기
              </NuxtLink>
            </DropdownMenuItem>
            <div class="ovf-sep" />
            <DropdownMenuItem class="ovf-item danger" :disabled="deleting" @select="removePost">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3h6v3" /></svg>
              기록 삭제
            </DropdownMenuItem>
          </OverflowMenu>
          <button type="button" class="btn primary mono" :disabled="!changes || saving" @click="save">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>
            {{ saving ? '저장 중' : '저장' }}
          </button>
        </div>
      </div>

      <!-- 모바일 -->
      <div class="hd-mobile">
        <AppBack fallback="/editor" label="기록 목록으로" />
        <!--
          잘린 제목은 «눌러서» 전체를 본다. 롱프레스 툴팁은 쓰지 않는다 — 텍스트 위
          롱프레스는 iOS 선택·확대경과 같은 제스처라 서로 잡아먹는다 (utils/tip.ts 의 🔴).
          h1 은 남기고 자르기·누르기는 안쪽 button 이 맡는다 — h1 이 inline-block 버튼을
          직접 자르면 말줄임표 없이 잘리기만 한다.
          공개 상세(p/[slug].vue)와 같은 마크업이다.
        -->
        <h1 class="hd-title">
          <!--
            🔴 자르는 것은 «버튼 안의 span» 이다. button 에 직접 text-overflow 를 걸면
               말줄임표가 안 붙고(버튼 내부는 익명 상자다), 버튼 기본 가운데 정렬까지
               겹쳐 글자가 양쪽으로 넘쳐 «앞»이 잘린다 — 「:마, 카미코치…」로 보였다.
          -->
          <button type="button" class="hd-title-btn" data-testid="editor-title-open" @click="titleDlg?.showModal()">
            <span class="hd-title-text">{{ draftTitle || '기록 편집' }}</span>
          </button>
        </h1>
        <OverflowMenu label="기록 메뉴" testid="editor-menu-narrow">
          <DropdownMenuItem class="ovf-item" :disabled="!changes" @select="revert">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4 -4l4 -4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></svg>
            변경 취소
            <span class="ovf-state">{{ changes ? `${changes}건` : '없음' }}</span>
          </DropdownMenuItem>
          <div class="ovf-sep" />
          <!-- 「기록 목록」은 없다 — 왼쪽 ← 가 같은 곳으로 간다 -->
          <DropdownMenuItem as-child class="ovf-item">
            <NuxtLink :to="`/p/${slug}`">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6s-6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6s6.6 2 9 6" /></svg>
              공개 화면 보기
            </NuxtLink>
          </DropdownMenuItem>
          <div class="ovf-sep" />
          <DropdownMenuItem class="ovf-item danger" :disabled="deleting" @select="removePost">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3h6v3" /></svg>
            기록 삭제
          </DropdownMenuItem>
        </OverflowMenu>
      </div>
    </header>

    <!--
      🔴 모바일 헤더에는 오류가 들어갈 자리가 없다 (한 줄에 [뒤로][제목][메뉴]로 꽉 찼고
         높이도 고정이다). 그래서 좁은 화면에서는 헤더 «밑»에 한 줄로 깐다 — 데스크탑은
         제목 옆에 이미 같은 값을 그린다. 이게 없으면 저장 실패·되돌림 같은 소식이
         폰에서 통째로 안 보인다: 정확히 「조용한 실패」다 (설계문서 §8).
    -->
    <ErrorNote class="err-bar" :message="errorMessage" @close="errorMessage = null" />

    <section v-if="!post" class="blank">
      <h3>기록을 찾을 수 없습니다</h3>
      <p class="mono">/editor/{{ slug }}</p>
    </section>

    <template v-else>
      <!-- 단계 — 1 기본 정보 → 2 포인트 편집 → 3 기록 편집 -->
      <nav class="steps" aria-label="편집 단계">
        <button
          type="button"
          class="stepbtn mono"
          :class="{ on: step === 'basic' }"
          :aria-current="step === 'basic' ? 'step' : undefined"
          @click="step = 'basic'"
        >
          <span class="sdot">1</span>
          기본 정보
        </button>
        <button
          type="button"
          class="stepbtn mono"
          :class="{ on: step === 'points' }"
          :aria-current="step === 'points' ? 'step' : undefined"
          @click="step = 'points'"
        >
          <span class="sdot">2</span>
          포인트 편집
        </button>
        <button
          type="button"
          class="stepbtn mono"
          :class="{ on: step === 'notes' }"
          :aria-current="step === 'notes' ? 'step' : undefined"
          @click="step = 'notes'"
        >
          <span class="sdot">3</span>
          기록 편집
        </button>
      </nav>

      <PostSettings
        v-if="step === 'basic'"
        v-model:title="draftTitle"
        v-model:summary="draftSummary"
        v-model:is-public="draftPublic"
        v-model:started-at="draftStart"
        v-model:ended-at="draftEnd"
        :post="post"
        :dirty="changes > 0"
        :busy="reclustering || deleting"
        @recluster="recluster"
      />

      <!-- 2단계 — 사진 전체를 포인트별 그룹으로 -->
      <div v-else-if="step === 'points'" class="boardpane">
        <!-- 상한을 넘겼거나 이미 있는 사진을 골랐을 때 — 조치가 따라붙는 줄이라 따로 띄운다 -->
        <p v-if="pointAddNotice" class="mono notice boxed">{{ pointAddNotice }}</p>
        <PointGroupBoard
          :groups="boardGroups"
          :cover-id="coverId"
          :add-blocked="pointAddBlocked"
          @drop="onBoardDrop"
          @remove-photo="onRemovePhoto"
          @pick-cover="onPickCover"
          @set-anchor="onSetAnchor"
          @open-photo="onOpenPhoto"
          @add-to-point="onAddToPoint"
          @sort-photos="onSortPhotos"
          @add="onAddPhotos"
        />
      </div>

      <!-- 3단계 — 포인트별 이름 · 태그 · 본문 · 대표 썸네일 -->
      <div v-else class="body">
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
              @click="selectPoint(pt.id)"
            >
              <span class="mono pnum">{{ String(i + 1).padStart(2, '0') }}</span>
              <img
                v-if="rowThumb(pt.id)"
                v-sk
                class="pthumb sk"
                :src="rowThumb(pt.id)!.thumb_path"
                :alt="`${pt.title.trim() || `포인트 ${i + 1}`} 대표 사진`"
                loading="lazy"
              >
              <span class="pmain">
                <span class="pname">{{ pt.title.trim() || '이름 없는 포인트' }}</span>
                <span class="mono psub">
                  {{ formatDateTime(basePoint(pt.id)?.first_shot_at ?? null) || '새 포인트' }}
                </span>
              </span>
              <span class="mono pcount">{{ pt.ids.length }}장</span>
            </li>
          </ol>
        </aside>

        <!-- 우: 선택된 포인트 편집 -->
        <section v-if="activeDraft" class="editor">
          <div class="ehead">
            <span class="mono enum">{{ String(activeIndex + 1).padStart(2, '0') }}</span>
            <input
              v-model="activeDraft.title"
              class="input title ptitle"
              maxlength="200"
              placeholder="포인트 이름"
              data-testid="editor-point-title-input"
            >
            <span v-if="activePoint" class="lockrow">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>
              <!--
                꼬리표를 뗐다. 「자리가 무엇인지」는 2단계 메뉴가 「지금 …」으로 말하고,
                여기서까지 되풀이하면 좁은 화면에서 이 줄이 가로로 넘친다.
                못 고친다는 신호는 자물쇠 아이콘이 이미 하고 있다.
              -->
              <span class="mono locktext">
                {{ formatDateTime(activePoint.first_shot_at) || '시각 없음' }}
                <template v-if="activeSpot">
                  · {{ activeSpot.lat.toFixed(5) }}, {{ activeSpot.lng.toFixed(5) }}
                </template>
              </span>
            </span>
            <!-- 아직 저장 전인 포인트는 앵커가 없다 — 저장할 때 담긴 사진들의 평균 좌표로 정해진다 -->
            <span v-else class="lockrow fresh">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
              <span class="mono">저장하면 담긴 사진들의 평균 좌표에 자리를 잡습니다</span>
            </span>
          </div>

          <div class="split">
            <div class="grid-col">
              <div class="pick-head">
                <span class="mono flabel">사진 {{ activePhotos.length }}</span>
                <span class="mono hint">
                  <template v-if="thumbPicking">대표로 쓸 사진을 고르세요 · Esc 로 취소</template>
                  <template v-else>눌러서 크게 보기</template>
                </span>
              </div>
              <div class="scroll-y picks" :class="{ picking: thumbPicking }">
                <button
                  v-for="(ph, i) in activePhotos"
                  :key="ph.id"
                  type="button"
                  class="pick phototile"
                  :aria-label="thumbPicking ? `${i + 1}번 사진을 대표로` : `${i + 1}번 사진 크게 보기`"
                  :data-testid="`editor-pick-${i}`"
                  @click="onPickClick(i, ph.id)"
                >
                  <!--
                    2단계 보드와 «같은» 칸이다 (PhotoTile). 삭제·손잡이 슬롯은 비워둔다 —
                    사진을 넣고 빼는 것도, 순서를 바꾸는 것도 2단계 몫이다.
                    「기본」과 「대표」를 나누지 않는다 — 보는 사람에게는 둘 다 그냥 대표 사진이다.
                  -->
                  <PhotoTile :photo="ph" :num="i + 1" :rep="ph.id === activeThumbId" :cover="ph.id === coverId" />
                </button>
              </div>
              <!-- 대표 지정은 사진 «아래»에 둔다. 2단계의 「커버 지정」과 같은 모드다. -->
              <div class="pick-foot">
                <!-- 이 버튼이 무엇을 정하는지 — 사진을 넣고 빼는 안내는 뺐다(2단계 몫이라 여기선 할 수 없는 말) -->
                <span class="mono pick-note">지도 마커와 목록에 뜨는 사진</span>
                <button
                  type="button"
                  class="minibtn mono"
                  :class="{ armed: thumbPicking }"
                  :aria-pressed="thumbPicking"
                  data-testid="editor-thumb-pick"
                  @click="thumbPicking = !thumbPicking"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg>
                  {{ thumbPicking ? '고르는 중…' : '대표 지정' }}
                </button>
              </div>
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
                  <!-- label 이라야 상자 여백을 눌러도 입력이 잡힌다 — span 이면 유효 타깃이 입력 높이(30.5px)뿐이다 -->
                  <label v-if="activeDraft.tags.length < MAX_TAGS" class="chip-add">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
                    <input
                      v-model="tagInput"
                      class="mono tag-input"
                      maxlength="40"
                      placeholder="태그"
                      v-enter="addTag"
                      data-testid="editor-tag-input"
                      @blur="addTag"
                    >
                  </label>
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

              <!--
                기타 정보 — 콘텐츠 아래. 공개 화면에서는 포인트 상세(데스크탑 우측 칸 ·
                모바일 ⓘ 판)에 같은 것이 뜬다 (PointExtras.vue).
              -->
              <div class="field">
                <span class="flabel-row">
                  <span class="mono flabel">링크</span>
                  <span class="mono counter">{{ activeDraft.links.length }} / {{ MAX_LINKS }}</span>
                </span>

                <div v-for="(l, i) in activeDraft.links" :key="i" class="xrow">
                  <input
                    v-model="l.url"
                    class="input small mono"
                    :maxlength="MAX_URL"
                    inputmode="url"
                    placeholder="https://"
                    :aria-label="`링크 ${i + 1} 주소`"
                    :data-testid="`editor-link-input-${i}`"
                  >
                  <button
                    type="button"
                    class="xkill"
                    :aria-label="`링크 ${i + 1} 삭제`"
                    @click="activeDraft.links.splice(i, 1)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
                  </button>
                </div>

                <div class="xacts">
                  <!-- 잠근 이유를 글자로 말한다 — 눌러도 아무 일이 없는 버튼을 두지 않는다 -->
                  <button
                    type="button"
                    class="minibtn mono"
                    :disabled="!mapLink || mapLinkExists || activeDraft.links.length >= MAX_LINKS"
                    data-testid="editor-maplink-btn"
                    @click="addMapLink"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" /></svg>
                    {{ mapLinkExists ? '구글 지도 — 이미 있음' : '구글 지도 자동 입력' }}
                  </button>
                  <button
                    type="button"
                    class="minibtn mono"
                    :disabled="activeDraft.links.length >= MAX_LINKS"
                    @click="addLink"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
                    링크 추가
                  </button>
                </div>
                <p class="mono xnote">자동 입력한 것은 「구글 지도」로, 직접 넣은 주소는 도메인으로 보입니다</p>
              </div>

              <div class="field">
                <span class="flabel-row">
                  <span class="mono flabel">소비한 금액</span>
                  <span class="mono counter">{{ activeDraft.expenses.length }} / {{ MAX_EXPENSES }}</span>
                </span>

                <div v-for="(e, i) in activeDraft.expenses" :key="i" class="xrow">
                  <input
                    v-model="e.item"
                    class="input small"
                    :maxlength="MAX_ITEM"
                    placeholder="품목명"
                    :aria-label="`${i + 1}번 품목명`"
                    :data-testid="`editor-expense-item-${i}`"
                  >
                  <input
                    v-model="e.amount"
                    class="input small amt mono"
                    :class="{ bad: badAmount(e) }"
                    inputmode="decimal"
                    maxlength="16"
                    placeholder="0"
                    :aria-label="`${i + 1}번 금액`"
                    :data-testid="`editor-expense-amount-${i}`"
                  >
                  <CurrencySelect
                    v-model="e.currency"
                    :label="`${i + 1}번 화폐`"
                    @update:model-value="rememberCurrency"
                  />
                  <button
                    type="button"
                    class="xkill"
                    :aria-label="`${i + 1}번 항목 삭제`"
                    @click="activeDraft.expenses.splice(i, 1)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
                  </button>
                </div>

                <div class="xacts">
                  <button
                    type="button"
                    class="minibtn mono"
                    :disabled="activeDraft.expenses.length >= MAX_EXPENSES"
                    data-testid="editor-expense-add"
                    @click="addExpense"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
                    항목 추가
                  </button>
                  <!-- 화폐가 섞이면 화폐마다 한 줄 — 섞어서 더하지 않는다 -->
                  <span v-if="activeTotals.length" class="xtotal">
                    <span class="mono xtlabel">합계</span>
                    <b v-for="t in activeTotals" :key="t.currency" class="mono">{{ formatMoney(t.amount, t.currency) }}</b>
                  </span>
                </div>
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

    <!--
      포인트별 사진 추가가 쓰는 파일 선택기. 단계와 무관하게 늘 DOM 에 있어야 한다 —
      2단계 안에 두면 클릭 시점에 ref 가 아직 안 잡히는 경우가 생긴다.
    -->
    <input ref="pointAddInput" type="file" accept="image/*" multiple hidden>

    <!-- 2단계에서 사진을 크게 보는 창. 그 포인트 안에서만 좌우로 넘어간다 -->
    <PhotoLightbox
      v-if="lightbox"
      :photos="lightboxPhotos"
      :point-name="lightboxName"
      :index="lightbox.index"
      :prev-name="null"
      :next-name="null"
      @close="lightbox = null"
      @move="lightbox = lightbox ? { ...lightbox, index: $event } : null"
    />

    <!--
      네이티브 <dialog> 다. 포커스 가둠 · ESC · ::backdrop · top layer 를 브라우저가 주고,
      닫기는 form method="dialog" 라 스크립트가 0줄이다.
    -->
    <dialog ref="titleDlg" class="titledlg" aria-label="기록 제목">
      <p class="titledlg-text">{{ draftTitle || '기록 편집' }}</p>
      <form method="dialog">
        <button type="submit" class="mono titledlg-close">닫기</button>
      </form>
    </dialog>

    <!-- 모바일: 저장은 화면 아래에서 손이 닿는 곳에 둔다 -->
    <BottomCta v-if="post">
      <button type="button" class="btn primary mono" :disabled="!changes || saving" @click="save">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>
        {{ saving ? '저장 중…' : '저장' }}
      </button>
    </BottomCta>

    <!--
      동작 중에는 화면을 막는다. 저장이 도는 동안 사진을 계속 끌 수 있으면
      서버로 나간 초안과 화면이 갈린다. 재클러스터링은 포인트 자체를 갈아치우므로 더 그렇다.
    -->
    <BusyOverlay
      v-if="pointAddBusy"
      :label="pointAddFlow.stage.value === 'scanning'
        ? `사진을 검사하는 중 ${pointAddFlow.scanProgress.value.done} / ${pointAddFlow.scanProgress.value.total}`
        : `이 포인트에 올리는 중 ${pointAddFlow.uploaded.value} / ${pointAddFlow.totalPhotos.value}장 (${pointAddFlow.uploadPercent.value}%)`"
    />
    <BusyOverlay v-else-if="saving" label="저장 중" />
    <BusyOverlay v-else-if="reclustering" label="포인트를 다시 묶는 중" />
    <BusyOverlay v-else-if="deleting" label="기록을 지우는 중" />
  </div>
</template>

<style scoped>
/* position — BusyOverlay(inset: 0)의 기준. overflow — 굴러가는 건 안쪽 한 칸뿐이다 */
.page { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* 상단바 */
.topbar {
  height: var(--topbar-h);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 var(--topbar-x);
  border-bottom: 1px solid rgb(var(--acc-rgb) / 0.28);
  background: rgb(var(--acc-rgb) / 0.06);
  /*
   * standalone 은 레이아웃 뷰포트가 상태바 밑까지 올라간다. 상단바가 직접
   * 안전영역만큼 자라면서 자기 불투명 배경으로 그 구간을 덮어야 한다 —
   * 투명한 채로 두면 시스템이 그 위에 합성해 헤더가 흐려 보인다.
   * 이 선언들은 블록 끝에 있어야 위의 padding/background 단축 선언을 이긴다.
   * 브라우저에서는 인셋이 0 이라 원래 모습 그대로다.
   */
  padding-top: var(--top-inset);
  height: calc(var(--topbar-h) + var(--top-inset));
  background: linear-gradient(rgb(var(--acc-rgb) / 0.06), rgb(var(--acc-rgb) / 0.06)), var(--s0);
}
.top-left { display: flex; align-items: center; gap: var(--topbar-gap); min-width: 0; }
.top-right { display: flex; align-items: center; gap: 14px; flex: none; }


/* 좁은 화면 전용 — 아래 미디어쿼리에서 켜진다 */
.err-bar { display: none; }
.err { font-size: var(--fs-2xs); min-width: 0; }


/* 버튼은 base.css 의 .btn 한 벌을 쓴다 (여백이 여기만 8px 13px 이었는데 14px 로 맞춘다) */

/*
 * 헤더 두 갈래. 둘 다 렌더하고 CSS 로 하나만 보인다 —
 * SSR 은 뷰포트를 모르므로 JS 로 분기하면 하이드레이션 불일치와 깜빡임이 난다.
 */
.hd-desktop { display: flex; align-items: center; justify-content: space-between; gap: 20px; width: 100%; }
.hd-mobile { display: none; }

/* 모바일 헤더 — [뒤로] [편집 대상] [메뉴] */
.hd-title { flex: 1; min-width: 0; display: flex; }
/* h1 이 직접 자르면 안쪽 inline-block 버튼은 말줄임표 없이 잘리기만 한다 */
.hd-title-btn {
  display: flex;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--font-display);
  /* 뷰어의 제목과 같은 값이다 — 두 화면을 오가며 같은 제목이 커졌다 작아졌다 하면 안 된다 */
  font-size: var(--title-size);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.hd-title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hd-title-btn:hover { color: var(--mid); }

/* 제목 전체 판 — 네이티브 <dialog> (top layer · ::backdrop · ESC 는 브라우저 몫).
   공개 상세(p/[slug].vue)와 같은 값을 쓴다. */
.titledlg {
  margin: auto;
  width: min(520px, calc(100vw - 32px));
  background: var(--s1);
  color: var(--ink);
  border: 1px solid rgb(var(--acc-rgb) / 0.28);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.titledlg::backdrop { background: rgb(var(--s0-rgb) / 0.7); backdrop-filter: blur(3px); }
.titledlg-text { font-size: var(--fs-2xl); line-height: 1.5; letter-spacing: -0.02em; text-wrap: pretty; overflow-wrap: anywhere; }
.titledlg-close {
  display: block;
  margin: 16px 0 0 auto;
  min-height: 40px;
  padding: 0 15px;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  font-size: var(--fs-sm);
  color: var(--mid);
  cursor: pointer;
}

/* 단계 탭 */
.steps {
  flex: none;
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 10px 24px;
  border-bottom: 1px solid rgb(var(--mid-rgb) / 0.1);
}
.stepbtn {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgb(var(--mid-rgb) / 0.18);
  border-radius: var(--radius);
  background: rgb(var(--s1-rgb) / 0.7);
  color: var(--faint);
  font-size: var(--fs-sm);
  letter-spacing: 0.04em;
  cursor: pointer;
}
.stepbtn.on { border-color: var(--focus-border); background: rgb(var(--acc-rgb) / 0.14); color: var(--ink); }
.sdot {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  background: rgb(var(--acc-rgb) / 0.14);
  border: 1px solid rgb(var(--mid-rgb) / 0.22);
  font-size: var(--fs-2xs);
  color: var(--mid);
}
.stepbtn.on .sdot { background: var(--mid); border-color: var(--mid); color: var(--s0); }

.field { display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 0; }
.flabel { font-size: var(--fs-micro); letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }

/* 입력은 base.css 의 .input / .input.small 한 벌을 쓴다 */


/* 2단계 — 보드 한 판이 전부다. 좌우 분할이 없다: 그룹이 세로로 길게 이어지는 화면이라
   옆 칸을 두면 사진 칸이 좁아지고, 좁아지면 드래그 조준이 어려워진다. */
.boardpane { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 14px 24px 18px; }

/* 본문 2열 */
.body { flex: 1; display: grid; grid-template-columns: 348px 1fr; min-height: 0; }

.points {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--hair);
  background: rgb(var(--s1-rgb) / 0.92);
}
.points-head {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 15px 18px 13px;
  border-bottom: 1px solid var(--hair);
}
.ph-title { font-size: var(--fs-2xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--mid); }
.ph-lock { font-size: var(--fs-2xs); color: var(--faint); }

/* min-height:0 + overflow 가 없으면 포인트가 많을 때 목록이 패널을 넘어
   아래 편집 블록 위로 흘러넘친다 (모바일에서 겹쳐 보이던 증상의 루트 원인) */
.point-list { flex: 1; min-height: 0; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.prow {
  display: grid;
  grid-template-columns: 28px 46px 1fr auto;
  gap: 11px;
  align-items: center;
  padding: 11px 14px 11px 18px;
  border-bottom: 1px solid var(--hair-soft);
  cursor: pointer;
}
.prow:hover { background: rgb(var(--ink-rgb) / 0.06); }
.prow.on { background: rgb(var(--ink-rgb) / 0.1); }
.pnum {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: var(--fs-2xs);
  font-weight: 600;
  background: rgb(var(--field-rgb) / 0.94);
  color: var(--mid);
  border: 1px solid rgb(var(--acc-rgb) / 0.6);
}
.prow.on .pnum { background: var(--ink); color: var(--s0); border-color: var(--ink); }
.pmain { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pname {
  font-size: var(--fs-lg);
  line-height: 1.2;
  color: var(--mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prow.on .pname { color: var(--ink); }
.psub { font-size: var(--fs-2xs); color: var(--faint); white-space: nowrap; }
.pcount { font-size: var(--fs-2xs); color: var(--faint); white-space: nowrap; }

/* 대표 썸네일 — 지도 마커·목록에 뜨는 사진이라 어느 포인트인지 눈으로 구분된다 */
.pthumb {
  display: block;
  width: 46px;
  height: 34px;
  flex: none;
  object-fit: cover;
  border-radius: 5px;
  background: var(--s3);
}

/* 선택된 포인트 편집 */
.editor { display: flex; flex-direction: column; min-width: 0; min-height: 0; }

.ehead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px 12px;
  border-bottom: 1px solid rgb(var(--mid-rgb) / 0.1);
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
  font-size: var(--fs-sm);
  font-weight: 600;
}
.ptitle { flex: 1; min-width: 0; }
.lockrow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 8px 12px;
  border: 1px dashed rgb(var(--mid-rgb) / 0.18);
  border-radius: var(--radius);
  font-size: var(--fs-2xs);
  color: var(--faint);
  white-space: nowrap;
}
/* 좁아지면 줄이 넘치는 대신 말줄임표로 접힌다 — 가로 스크롤은 만들지 않는다 */
.locktext { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* 아직 저장 전인 포인트 — 좌표가 없다는 걸 색으로도 구분한다 */
.lockrow.fresh { border-color: rgb(var(--route-soft-rgb) / 0.42); color: var(--route); white-space: normal; }

.split { flex: 1; display: grid; grid-template-columns: 1fr 420px; min-height: 0; }
.grid-col {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 15px 24px;
  min-width: 0;
  min-height: 0;
}

/* 썸네일 픽커 */
.pick-head { flex: none; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.hint { font-size: var(--fs-2xs); color: var(--deep); }
/*
 * 🔴 트랙을 «1fr 로 늘리지 않는다».
 *
 * minmax(104px, 1fr) 이었을 때 판이 넓어지면 칸도 같이 넓어졌는데, 사진 높이는
 * --tile-img-h 로 고정이라 상자만 옆으로 늘어났다 (104×74 = 1.40 → 116×74 = 1.57).
 * object-fit: cover 라 늘어난 만큼 위아래가 잘려 나간다 — 세로 사진은 가운데 띠만
 * 남아 무엇을 찍었는지 알아볼 수 없었다.
 *
 * 이 칸은 2단계 보드와 «같은» 칸이어야 한다(아래 PhotoTile 주석). 너비를 토큰으로
 * 묶어 두고, 남는 폭은 칸이 아니라 «사이»가 가져가게 한다.
 */
.picks {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--tile-w));
  justify-content: space-between;
  gap: 9px;
  align-content: start;
}
/* 겉모습(상자 · 사진 · 번호 · 배지 · 시각 줄)은 .phototile 과 PhotoTile 이 준다.
   🔴 대표 사진을 감싸던 링은 뺐다. 2단계에는 없고 여기만 있어서 같은 칸이 두 단계에서
      다르게 보였다 — 어느 것이 대표인지는 「대표」 배지가 이미 말한다. */
.pick { display: block; padding: 0; border: 0; cursor: pointer; }
/* 설명 좌 · 버튼 우, 양 끝으로. 좁아지면 버튼이 아래로 내려간다 */
.pick-foot { flex: none; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; }
.pick-note { min-width: 0; font-size: var(--fs-2xs); color: var(--faint); }
/* 고르는 중 — 다음에 누를 것이 「버튼」이 아니라 「사진」이라는 걸 색으로 말한다 (2단계와 같다) */
.picks.picking .pick:hover { box-shadow: inset 0 0 0 2px var(--acc); }

/* 🔴 .field 는 flex: 1 이다 (태그+콘텐츠 둘뿐이던 시절의 값). 그대로 두면 링크·소비까지
   남는 높이를 나눠 가져 링크 아래에 빈 칸이 크게 뜬다 — 늘어나는 건 콘텐츠 하나뿐이다. */
.side > .field { flex: none; }
.side > .field.grow { flex: 1; }
.side {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 15px 24px;
  border-left: 1px solid rgb(var(--mid-rgb) / 0.1);
  min-height: 0;
}
/* 아래에 기타 정보가 붙는다 — min-height 0 이면 콘텐츠 칸이 눌려 텍스트영역이 넘쳐 나온다 */
.field.grow { flex: 1; min-height: 190px; }

.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-2xs);
  letter-spacing: 0.06em;
  color: var(--mid);
  background: rgb(var(--acc-rgb) / 0.12);
  border: 1px solid rgb(var(--acc-rgb) / 0.4);
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
  background: rgb(var(--s0-rgb) / 0.5);
  border: 1px solid var(--hair);
  color: var(--deep);
  cursor: pointer;
}
.chip-x:hover { background: var(--danger-fill); border-color: var(--danger-fill); color: var(--ink); }
/* 터치 타깃 44px — 칩 모양은 그대로 두고 보이지 않는 판만 넓힌다 */
@media (max-width: 900px) {
  .chip-x { position: relative; }
  .chip-x::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
}
.chip-add {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--faint);
  border: 1px dashed rgb(var(--mid-rgb) / 0.24);
  border-radius: var(--radius);
  padding: 4px 9px;
  transition: border-color 0.12s, box-shadow 0.12s;
}
/* 테두리 없는 input 에 outline 을 그리면 점선 칩 안쪽에 사각형이 하나 더 생긴다.
   감싸는 칩이 대신 빛나게 하고 input 자신의 링은 끈다. */
.chip-add:focus-within {
  border-style: solid;
  border-color: var(--focus-border);
  box-shadow: var(--focus-ring);
  color: var(--mid);
}
.tag-input { width: 76px; font-size: var(--fs-2xs); color: var(--ink); }
.tag-input:focus-visible { outline: none; }
.tag-input::placeholder { color: var(--faint); }

/* 라벨 좌 · 카운터 우. 규칙이 없어서 두 인라인 span 이 「콘텐츠54 / 2000」으로 붙어 있었다. */
.flabel-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.counter { font-size: var(--fs-micro); color: var(--faint); }
.counter.full { color: var(--danger); }
.content {
  flex: 1;
  min-height: 140px;
  resize: none;
  background: var(--field);
  border: 1px solid rgb(var(--mid-rgb) / 0.16);
  border-radius: var(--radius);
  padding: 12px 13px;
  font-size: var(--fs-md);
  line-height: 1.72;
  color: var(--mid);
}
.content:focus { border-color: var(--focus-border); box-shadow: var(--focus-ring); outline: none; }
.content::placeholder { color: var(--faint); }

/* 기타 정보 — 링크 · 소비 금액. 352px 칸에 들어가야 해서 줄바꿈을 허용한다.
   칸 자체는 base.css 의 .input.small 이다 (높이 --field-h-sm). */
.xrow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
/*
 * [품목 45 · 금액 30 · 화폐 15] 로 «남는 폭»을 나눈다. flex-basis 를 고정값으로 주면
 * 좁은 칸(352px)에서 품목·금액이 나란히 쪼그라든다 — 실제로 84/68px 까지 줄어 있었다.
 * 지우기(✕)만 비율에서 뺀다: 5% 면 15px 이라 손가락이 닿지 않는다.
 */
.xrow .input { flex: 45 1 0; min-width: 0; }
.xrow .input.amt { flex: 30 1 0; text-align: right; }
/* 숫자로 안 읽히는 금액 — 저장하면 0 이 되므로 미리 붉게 알린다 */
.input.bad { border-color: rgb(var(--danger-rgb) / 0.55); color: var(--danger); }

.xkill {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  color: var(--faint);
  cursor: pointer;
}
.xkill:hover { background: rgb(var(--danger-rgb) / 0.14); color: var(--danger); }

.xacts { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.minibtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  border-radius: var(--radius);
  font-size: var(--fs-2xs);
  color: var(--mid);
  cursor: pointer;
}
.minibtn:hover:not(:disabled) { background: rgb(var(--acc-rgb) / 0.1); }
/* 고르는 중 — 2단계 「커버 지정」(.addbtn.armed)과 같은 강조다. 없으면 모드가 켜진 것이 안 보인다. */
.minibtn.armed { background: var(--acc); border-color: var(--acc); color: var(--s0); }
.minibtn:disabled { opacity: 0.45; cursor: default; }
.xnote { font-size: var(--fs-micro); color: var(--faint); }
.xtotal { margin-left: auto; display: flex; align-items: baseline; gap: 10px; }
.xtlabel { font-size: var(--fs-micro); color: var(--faint); }
.xtotal b { font-size: var(--fs-sm); color: var(--ink); }

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
  /* 셸이 overflow: hidden 이라 문서 스크롤이 없다 — 짧은 화면(가로 모드 등)에서
     내용이 넘치면 여기서 굴러야 잘리지 않는다 */
  overflow-y: auto;
}
.blank h3 { font-size: var(--fs-2xl); color: var(--ink); }
.blank p { font-size: var(--fs-xs); color: var(--faint); }

@media (max-width: 1240px) {
  .split { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .side { border-left: 0; border-top: 1px solid rgb(var(--mid-rgb) / 0.1); }
  .body { grid-template-columns: 280px 1fr; }
}
/* 모바일 — 데스크탑의 「고정 높이 패널 격자」를 페이지 세로 스크롤 하나로 바꾼다.
   390px 에서는 상단바가 한 줄에 안 들어가 겹치고, min-width:0 인 flex 필드는
   wrap 대신 무한히 찌그러지고, 패널 격자는 서로 파고든다. */
@media (max-width: 900px) {
  /* 헤더 갈래 전환 — 데스크탑 마크업은 통째로 빠지고 모바일 것이 들어온다 */
  .hd-desktop { display: none; }
  .hd-mobile { display: flex; align-items: center; gap: 8px; width: 100%; }
  .err-bar {
    /* 🔴 flex 여야 한다. block 으로 두면 ErrorNote 의 display:flex 를 «이 규칙이 이겨»
       문구와 닫기 버튼이 두 줄로 쌓인다 (실제로 58px 짜리 두 줄이 됐다). */
    display: flex;
    flex: none;
    margin: 0;
    padding: 9px var(--topbar-x-sm);
    background: rgb(var(--danger-rgb) / 0.12);
    border-bottom: 1px solid rgb(var(--danger-rgb) / 0.3);
    font-size: var(--fs-2xs);
    color: var(--danger);
  }
  .topbar { height: calc(var(--topbar-h-sm) + var(--top-inset)); gap: 0; padding: var(--top-inset) var(--topbar-x-sm) 0; }

  .steps { padding: 8px 14px; gap: 6px; }
  .stepbtn { flex: 1; justify-content: center; min-height: 44px; padding: 0 8px; }


  /* 보드는 좌우 여백만 줄인다 — 세로 스크롤은 보드가 스스로 갖는다 */
  .boardpane { padding: 10px 12px calc(var(--cta-h) + env(safe-area-inset-bottom)); }

  /* 본문: 격자를 풀고 이 칸 하나가 굴러가게 둔다 (문서는 스크롤하지 않는다) */
  .body { display: block; min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; }
  /* 좁은 화면에서 46px 썸네일까지 넣으면 이름이 두 글자만 남는다 — 썸네일을 줄인다 */
  .prow { grid-template-columns: 24px 38px 1fr auto; padding: 10px 12px 10px 14px; }
  .pthumb { width: 38px; height: 30px; }
  .points {
    /* 포인트가 60개여도 편집 블록에 닿을 수 있어야 한다 — 목록만 따로 스크롤 */
    max-height: 45dvh;
    border-right: 0;
    border-bottom: 1px solid var(--hair);
  }
  .editor, .split { display: block; min-height: 0; }
  .ehead { flex-wrap: wrap; padding: 12px 16px; }
  .grid-col { min-height: 0; padding: 14px 16px; }
  /* 굴러가는 칸은 .body 하나다 — 여기서 또 스크롤하면 중첩이라 어느 쪽이 움직일지 모른다 */
  .side { min-height: 0; overflow: visible; padding: 14px 16px calc(var(--cta-h) + env(safe-area-inset-bottom)); }

  /* 태그 칩도 터치 타깃이다 — 입력이 16px 로 커지므로 칩도 같이 키운다 */
  .tags { gap: 8px; }
  .chip { min-height: 36px; font-size: var(--fs-sm); padding: 4px 6px 4px 11px; }
  .chip-x { width: 24px; height: 24px; }
  /* 입력은 보이지 않는 판을 못 넓힌다 — 상자 자체가 손가락이 닿는 곳이라 44px */
  .chip-add { min-height: 44px; padding: 4px 12px; flex: 1; min-width: 140px; }

  /* 기타 정보 — 입력이 16px 로 커지므로(base.css) 줄이 넘친다. 지우기·추가도 손가락 크기로 */
  .xrow { gap: 8px; }
  /* 보이는 크기는 줄이고 닿는 면적은 44px 로 넓힌다 — 그 8px 이 품목명 칸으로 간다 */
  .xkill { position: relative; width: 32px; height: 32px; }
  .xkill::after { content: ''; position: absolute; top: -6px; left: -6px; width: 44px; height: 44px; }
  .minibtn { min-height: 40px; font-size: var(--fs-sm); padding: 0 12px; }
  .xnote { font-size: var(--fs-xs); }
  .xtotal b { font-size: var(--fs-md); }
  .tag-input { flex: 1; width: auto; min-width: 0; }
  .side { border-left: 0; border-top: 1px solid rgb(var(--mid-rgb) / 0.1); }
  .field.grow { min-height: 0; }
}
</style>
