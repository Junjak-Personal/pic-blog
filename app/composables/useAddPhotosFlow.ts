/**
 * 사진 추가 플로우 — 아트보드 1f.
 * 최초 업로드(useUploadFlow)와 알고리즘이 다르다: 기존 포인트 중심은 불변이고,
 * 반경 안이면 합류 / 밖이면 추가 사진끼리 다시 묶어 새 포인트를 만든다 (설계문서 §4.2).
 */
import type { AddPhotosInput, CreatePostResult, UploadPhotoInput } from '#shared/types/upload'
import type { Point } from '#shared/types/db'
import { assignTo, DEFAULT_RADIUS, RADII, type ClusterInput, type ExistingPoint } from '#shared/utils/cluster'
import { outputExt, resizePhoto } from '~/utils/resize'
import { photoKey, scanFiles, type ScannedPhoto, type SkippedPhoto } from '~/utils/exif'

export type AddStage = 'idle' | 'scanning' | 'preview' | 'uploading' | 'done'

interface FailedPhoto {
  key: string
  name: string
  bytes: number
  reason: string
}

export function useAddPhotosFlow(slug: Ref<string>, points: Ref<Point[]>) {
  const stage = ref<AddStage>('idle')
  const scanned = ref<ScannedPhoto[]>([])
  const skipped = ref<SkippedPhoto[]>([])
  const radius = ref<number>(DEFAULT_RADIUS)
  const scanProgress = ref({ done: 0, total: 0 })
  const uploaded = ref(0)
  const totalPhotos = ref(0)
  const failed = ref<FailedPhoto[]>([])
  const photoIds = ref<Record<string, number>>({})
  const errorMessage = ref<string | null>(null)

  /** 기존 포인트를 배정 알고리즘이 받는 최소 형태로 좁힌다 */
  const existing = computed<ExistingPoint[]>(() =>
    points.value.map((p) => ({ id: p.id, title: p.title, lat: p.lat, lng: p.lng, order_index: p.order_index })),
  )

  /** 반경을 바꾸면 여기서 그 자리 재계산된다. 지도 뷰포트는 건드리지 않는다. */
  const assignment = computed(() => assignTo(scanned.value, existing.value, radius.value))

  /** 「반경별 결과」 비교표 (아트보드 1f 우측) */
  const radiusTable = computed(() =>
    RADII.map((r) => {
      const a = assignTo(scanned.value, existing.value, r)
      return { radius: r, joinedShots: a.joinedShots, joinCount: a.joins.length, newCount: a.news.length }
    }),
  )

  const totalAfter = computed(() => points.value.length + assignment.value.news.length)

  const uploadPercent = computed(() =>
    totalPhotos.value ? +((uploaded.value / totalPhotos.value) * 100).toFixed(1) : 0,
  )

  function reset() {
    scanned.value = []
    skipped.value = []
    failed.value = []
    photoIds.value = {}
    uploaded.value = 0
    totalPhotos.value = 0
    errorMessage.value = null
    radius.value = DEFAULT_RADIUS
    stage.value = 'idle'
  }

  async function selectFiles(files: readonly File[]) {
    reset()
    stage.value = 'scanning'
    scanProgress.value = { done: 0, total: files.length }
    // 이 기록에 이미 들어 있는 사진들 — 같은 사진을 또 올리는 걸 여기서 막는다.
    // 서버를 새로 부르지 않는다: 편집 화면이 이미 사진마다 shot_at·좌표를 들고 있다.
    const existingKeys = new Set(
      points.value.flatMap((pt) =>
        pt.photos
          .filter((ph) => ph.shot_at)
          .map((ph) => photoKey({ shotAt: ph.shot_at!, lat: ph.lat, lng: ph.lng })),
      ),
    )
    const result = await scanFiles(files, (done, total) => {
      scanProgress.value = { done, total }
    }, existingKeys)
    scanned.value = result.passed
    skipped.value = result.skipped
    stage.value = 'preview'
  }

  function toInput(shot: ScannedPhoto, ext: string): UploadPhotoInput {
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

  /**
   * 매니페스트 POST → 사진마다 [리사이즈 → PUT → 해제].
   * 전 장을 미리 리사이즈해 들고 있던 예전 순서는 200장 배치에서 메모리 상한에 걸렸다.
   * 자세한 이유는 useUploadFlow.confirm() 주석 참고 — 두 플로우가 같은 구조다.
   */
  async function confirm() {
    if (!scanned.value.length) return
    stage.value = 'uploading'
    errorMessage.value = null
    failed.value = []
    uploaded.value = 0
    totalPhotos.value = scanned.value.length

    const shots = scanned.value
    const byKey = new Map(shots.map((s) => [s.key, s]))
    const ext = outputExt()

    const pick = (s: ClusterInput) => {
      const shot = byKey.get(s.key)
      return shot ? toInput(shot, ext) : null
    }
    const notNull = (p: UploadPhotoInput | null): p is UploadPhotoInput => p !== null

    const body: AddPhotosInput = {
      joins: assignment.value.joins
        .map((j) => ({ pointId: j.point.id, photos: j.shots.map(pick).filter(notNull) }))
        .filter((j) => j.photos.length > 0),
      news: assignment.value.news
        .map((c) => ({
          lat: c.lat,
          lng: c.lng,
          title: null,
          first_shot_at: byKey.get(c.shots[0]!.key)?.shotAt ?? null,
          photos: c.shots.map(pick).filter(notNull),
        }))
        .filter((p) => p.photos.length > 0),
    }

    if (!body.joins.length && !body.news.length) {
      errorMessage.value = '추가할 사진이 없습니다'
      stage.value = 'preview'
      return
    }

    let created: CreatePostResult
    try {
      created = await $fetch<CreatePostResult>(`/api/posts/${slug.value}/photos`, {
        method: 'POST',
        body,
      })
    } catch (e) {
      errorMessage.value = reasonOf(e)
      stage.value = 'preview'
      return
    }

    photoIds.value = created.photoIds
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
      failed.value.push({ key: shot.key, name: shot.name, bytes: display.size, reason: reasonOf(e) })
    }
  }

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

  /** 끝내 못 올린 사진 행을 지운다 — 행만 남으면 깨진 이미지가 된다 */
  async function skipFailed() {
    const ids = failed.value.map((f) => photoIds.value[f.key]).filter((v): v is number => v != null)
    if (ids.length) await $fetch('/api/photos', { method: 'DELETE', body: { ids } })
    failed.value = []
  }

  return {
    stage, scanned, skipped, radius, assignment, radiusTable, totalAfter,
    scanProgress, uploaded, totalPhotos, uploadPercent, failed, errorMessage,
    selectFiles, confirm, retryFailed, skipFailed, reset,
  }
}

/** h3 statusMessage 는 한국어가 sanitize 로 털려 빈 문자열이 되므로 본문 쪽을 먼저 읽는다 */
function reasonOf(e: unknown): string {
  if (typeof e === 'object' && e !== null) {
    const err = e as { data?: { statusMessage?: unknown }; message?: unknown }
    const fromBody = err.data?.statusMessage
    if (typeof fromBody === 'string' && fromBody) return fromBody
    if (typeof err.message === 'string' && err.message.includes('timeout')) return '타임아웃'
  }
  return '업로드 실패'
}
