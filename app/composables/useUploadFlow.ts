/**
 * 업로드 플로우 상태 — 1c 진입 → 파일 선택 → 검사(1g 상단) → 클러스터 미리보기(1g) →
 * 진행률(1c) → 편집(/editor/[slug]).
 * 전 단계가 클라이언트에서 돈다. 서버는 매니페스트와 바이트를 받을 뿐이다.
 */
import type { CreatePostResult, UploadPhotoInput, UploadPointInput } from '#shared/types/upload'
// 자동 임포트에 기대지 않는다 — unimport 스캐너가 연속된 `export const` 중 두 번째부터 놓친다
import { clusterAt, DEFAULT_RADIUS, RADII } from '#shared/utils/cluster'
import { formatRange } from '#shared/utils/format'
import { outputExt, resizePhoto } from '~/utils/resize'
import { scanFiles, type ScannedPhoto, type SkippedPhoto } from '~/utils/exif'

export type UploadStage = 'idle' | 'scanning' | 'preview' | 'uploading' | 'done'

export interface FailedPhoto {
  key: string
  name: string
  bytes: number
  reason: string
}

export function useUploadFlow() {
  const stage = ref<UploadStage>('idle')
  const scanned = ref<ScannedPhoto[]>([])
  const skipped = ref<SkippedPhoto[]>([])
  const radius = ref<number>(DEFAULT_RADIUS)
  const scanProgress = ref({ done: 0, total: 0 })
  /** 실제로 디스크에 안착한 사진 수. 진행률은 시도가 아니라 이 값으로 낸다 —
      시도 기준이면 전부 실패해도 100% 로 보고하는 거짓말이 된다 (설계문서 §8). */
  const uploaded = ref(0)
  const totalPhotos = ref(0)
  const failed = ref<FailedPhoto[]>([])
  const createdSlug = ref<string | null>(null)
  /** 업로드 세션 키 → photo.id. 재시도·건너뛰기가 이걸 쓴다. */
  const photoIds = ref<Record<string, number>>({})
  const errorMessage = ref<string | null>(null)

  // 반경을 바꾸면 여기서 그 자리 재계산된다. 지도 뷰포트는 건드리지 않는다.
  const clusters = computed(() => clusterAt(scanned.value, radius.value))

  /** 「반경별 결과」 비교표 — 네 값의 결과를 한눈에 (아트보드 1g 우측) */
  const radiusTable = computed(() =>
    RADII.map((r) => {
      const cs = clusterAt(scanned.value, r)
      return { radius: r, count: cs.length, gaps: cs.filter((c) => c.gap).length }
    }),
  )

  const gapCount = computed(() => clusters.value.filter((c) => c.gap).length)

  async function selectFiles(files: readonly File[]) {
    reset()
    stage.value = 'scanning'
    scanProgress.value = { done: 0, total: files.length }
    const result = await scanFiles(files, (done, total) => {
      scanProgress.value = { done, total }
    })
    scanned.value = result.passed
    skipped.value = result.skipped
    stage.value = 'preview'
  }

  function reset() {
    scanned.value = []
    skipped.value = []
    failed.value = []
    uploaded.value = 0
    totalPhotos.value = 0
    createdSlug.value = null
    photoIds.value = {}
    errorMessage.value = null
    radius.value = DEFAULT_RADIUS
    stage.value = 'idle'
  }

  function toPhotoInput(shot: ScannedPhoto, ext: string): UploadPhotoInput {
    return {
      key: shot.key,
      displayExt: ext,
      thumbExt: ext,
      lat: shot.lat,
      lng: shot.lng,
      shot_at: shot.shotAt,
      camera: shot.camera,
      f_number: shot.fNumber,
      exposure: shot.exposure,
      iso: shot.iso,
    }
  }

  /** 1g 에는 타이틀 입력이 없다 — 촬영 기간에서 임시 제목을 만들고 편집 화면에서 고친다. */
  const provisionalTitle = computed(() => {
    const first = scanned.value[0]?.shotAt
    const last = scanned.value.at(-1)?.shotAt
    if (!first) return '새 기록'
    const range = formatRange(first, last ?? first)
    return `${range} 기록`
  })

  /**
   * 확정 — 매니페스트 POST → 사진마다 [리사이즈 → PUT → 해제].
   *
   * 순서가 중요하다. 예전에는 전 장을 먼저 리사이즈해 Map 에 쌓아두고 그 다음에 올렸는데,
   * 매니페스트가 리사이즈 결과(w/h/ext)를 요구했기 때문이다. 그러면 200장 배치에서
   * display+thumb Blob 약 107MB 를 동시에 들고 있게 되고 iOS Safari 탭 상한에 걸린다.
   * 게다가 전부 끝날 때까지 서버에 한 장도 안 올라가 있어 탭이 죽으면 전량 손실이었다.
   * 지금은 매니페스트에 파생값이 없으므로 먼저 보낼 수 있고, 동시 보유량이 항상 1장이라
   * 장수 상한이 사실상 사라진다. 중간에 죽어도 거기까지는 서버에 남는다.
   */
  async function confirm(title = provisionalTitle.value) {
    if (!scanned.value.length) return
    stage.value = 'uploading'
    errorMessage.value = null
    failed.value = []
    uploaded.value = 0

    const shots = scanned.value
    totalPhotos.value = shots.length

    const byKey = new Map(shots.map((s) => [s.key, s]))
    const ext = outputExt()

    // 1) 매니페스트 — 리사이즈 전에 간다. 좌표·시각은 전부 EXIF 스캔에서 이미 나왔다.
    const points: UploadPointInput[] = clusters.value.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      title: null,
      first_shot_at: byKey.get(c.shots[0]!.key)?.shotAt ?? null,
      photos: c.shots
        .map((s) => byKey.get(s.key))
        .filter((v): v is ScannedPhoto => v !== undefined)
        .map((shot) => toPhotoInput(shot, ext)),
    }))

    let created: CreatePostResult
    try {
      created = await $fetch<CreatePostResult>('/api/posts', {
        method: 'POST',
        body: { title, radius: radius.value, points },
      })
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : '기록을 만들지 못했습니다'
      stage.value = 'preview'
      return
    }

    createdSlug.value = created.slug
    photoIds.value = created.photoIds

    // 2) 바이트 — 한 장씩. 실패는 목록에 남기고 계속 간다 (설계문서 §8).
    for (const shot of shots) {
      const id = created.photoIds[shot.key]
      if (id != null) await uploadOne(shot, id)
    }

    stage.value = 'done'
  }

  /** 사진 1장: 리사이즈 → PUT. Blob 은 이 함수를 벗어나면 참조가 끊겨 회수된다. */
  async function uploadOne(shot: ScannedPhoto, id: number) {
    let display: Blob, thumb: Blob, w: number, h: number, dExt: string, tExt: string
    try {
      const d = await resizePhoto(shot.file)
      ;({ blob: display, w, h, ext: dExt } = d.display)
      ;({ blob: thumb, ext: tExt } = d.thumb)
    } catch {
      failed.value.push({ key: shot.key, name: shot.name, bytes: shot.file.size, reason: '변환 실패' })
      return
    }

    const form = new FormData()
    form.append('display', display, `${id}_display.${dExt}`)
    form.append('thumb', thumb, `${id}_thumb.${tExt}`)
    form.append('w', String(w))
    form.append('h', String(h))

    try {
      await $fetch(`/api/photos/${id}`, { method: 'PUT', body: form })
      failed.value = failed.value.filter((f) => f.key !== shot.key)
      uploaded.value++
    } catch (e) {
      failed.value.push({
        key: shot.key,
        name: shot.name,
        bytes: display.size,
        reason: e instanceof Error && e.message.includes('timeout') ? '타임아웃' : '업로드 실패',
      })
    }
  }

  /** 「N장 재시도」 — 실패한 것만 다시 올린다. 원본 File 은 그대로 있으므로 다시 리사이즈한다. */
  async function retryFailed() {
    const byKey = new Map(scanned.value.map((s) => [s.key, s]))
    const targets = [...failed.value]
    failed.value = []
    for (const f of targets) {
      const id = photoIds.value[f.key]
      const shot = byKey.get(f.key)
      if (id != null && shot) await uploadOne(shot, id)
    }
  }

  /** 「건너뛰고 저장」 — 끝내 못 올린 사진 행을 지운다. 행만 남으면 깨진 이미지가 된다. */
  async function skipFailed() {
    const ids = failed.value.map((f) => photoIds.value[f.key]).filter((v): v is number => v != null)
    if (ids.length) await $fetch('/api/photos', { method: 'DELETE', body: { ids } })
    failed.value = []
  }

  return {
    stage,
    scanned,
    skipped,
    radius,
    clusters,
    radiusTable,
    gapCount,
    scanProgress,
    uploaded,
    totalPhotos,
    failed,
    createdSlug,
    photoIds,
    provisionalTitle,
    errorMessage,
    selectFiles,
    confirm,
    retryFailed,
    skipFailed,
    reset,
  }
}
