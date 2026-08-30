/**
 * 사진 추가 플로우 — 아트보드 1f.
 * 최초 업로드(useUploadFlow)와 알고리즘이 다르다: 기존 포인트 중심은 불변이고,
 * 반경 안이면 합류 / 밖이면 추가 사진끼리 다시 묶어 새 포인트를 만든다 (설계문서 §4.2).
 */
import type { AddPhotosInput, CreatePostResult, UploadPhotoInput } from '#shared/types/upload'
import type { Point } from '#shared/types/db'
import { assignTo, DEFAULT_RADIUS, RADII, type ClusterInput, type ExistingPoint } from '#shared/utils/cluster'
import { outputExt, resizePhoto } from '~/utils/resize'
import { MAX_PER_SELECTION, photoKey, scanFiles, type ScannedPhoto, type SkippedPhoto } from '~/utils/exif'
import { pickPhotos, releaseSources, sourceSize, type PhotoSource } from '~/utils/native'

/** loading = 껍데기가 사진첩에서 원본을 꺼내는 구간 (useUploadFlow 의 같은 이름과 같은 뜻) */
export type AddStage = 'idle' | 'loading' | 'scanning' | 'preview' | 'uploading' | 'done'

interface FailedPhoto {
  key: string
  name: string
  bytes: number
  reason: string
}

/**
 * 「이 포인트로」 강제 모드.
 * 편집 3단계에서 한 포인트에 사진을 직접 붙일 때 쓴다 — 좌표로 배정하지 않고,
 * 고른 사진이 «전부» 그 포인트로 들어간다 (멀리서 찍힌 사진도 맥락으로 묶을 수 있게).
 */
export interface AddPhotosOptions {
  /** 값이 있으면 배정을 건너뛰고 이 포인트에 붙인다 */
  pointId?: Ref<number | null>
  /** 한 번에 처리할 사진 수 상한 */
  limit?: number
  /**
   * 붙이기 «전»의 기록 기간.
   *
   * 서버는 사진을 붙일 때마다 started_at/ended_at 을 MIN/MAX(shot_at) 으로 다시 계산한다
   * (posts/[slug]/photos.post.ts — 손으로 고친 기간도 그때 되돌아간다는 것이 명시된 규약이다).
   * 「전부 취소」가 그 계산까지 되돌리려면 확정 «직전»의 값을 알아야 하는데, 확정 뒤에는
   * 화면이 기록을 새로 받으므로 그때 읽으면 이미 넓어진 값이다. 그래서 옵션으로 받는다.
   */
  period?: Ref<{ started_at: string | null; ended_at: string | null } | null>
}

export function useAddPhotosFlow(slug: Ref<string>, points: Ref<Point[]>, opts: AddPhotosOptions = {}) {
  const stage = ref<AddStage>('idle')
  const scanned = ref<ScannedPhoto[]>([])
  const skipped = ref<SkippedPhoto[]>([])
  const radius = ref<number>(DEFAULT_RADIUS)
  const scanProgress = ref({ done: 0, total: 0 })
  /** 껍데기가 원본을 꺼내는 동안의 진행 (loading 단계) */
  const loadProgress = ref({ done: 0, total: 0 })
  const uploaded = ref(0)
  const totalPhotos = ref(0)
  const failed = ref<FailedPhoto[]>([])
  const photoIds = ref<Record<string, number>>({})
  const errorMessage = ref<string | null>(null)
  /**
   * 방금 마친 추가의 결과 — 완료 화면이 읽는다.
   *
   * 🔴 완료 화면에서 assignment 를 그대로 읽으면 안 된다. 「이어서 추가」를 대비해
   *    업로드 직후 기록을 새로 받는데, 그러면 points 가 바뀌면서 assignment 가 다시
   *    계산돼 방금 한 일과 다른 숫자가 뜬다. 그 순간의 값을 여기 찍어둔다.
   */
  const result = ref<{ photos: number; joined: number; created: number; leftover: number } | null>(null)
  /** 확정 직전에 찍어둔 기간. 되돌릴 때만 쓰므로 화면에 나가지 않는다 — ref 가 아니다. */
  let periodBefore: { started_at: string | null; ended_at: string | null } | null = null

  /** 기존 포인트를 배정 알고리즘이 받는 최소 형태로 좁힌다 */
  const existing = computed<ExistingPoint[]>(() =>
    points.value.map((p) => ({
      id: p.id,
      title: p.title,
      lat: p.lat,
      lng: p.lng,
      order_index: p.order_index,
      // 날짜가 다르면 같은 자리라도 합류시키지 않는다 (cluster.ts 의 dayOf)
      first_shot_at: p.first_shot_at,
    })),
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
    void releaseSources(scanned.value.map((s) => s.src))
    scanned.value = []
    skipped.value = []
    failed.value = []
    photoIds.value = {}
    uploaded.value = 0
    totalPhotos.value = 0
    errorMessage.value = null
    result.value = null
    periodBefore = null
    radius.value = DEFAULT_RADIUS
    stage.value = 'idle'
  }

  /**
   * 고르기부터 검사까지 한 번에.
   * 🔴 pickPhotos 앞에 await 를 두면 안 된다 (사파리의 제스처 규칙 — useUploadFlow 와 같다).
   */
  async function pick(input: HTMLInputElement | null) {
    const picking = pickPhotos(input, opts.limit ?? MAX_PER_SELECTION, (done, total) => {
      stage.value = 'loading'
      loadProgress.value = { done, total }
    })
    const { sources, failed } = await picking
    if (sources.length) {
      await selectFiles(sources)
      /*
       * 껍데기가 원본을 못 꺼낸 사진 — 조용히 사라지면 안 된다 (설계문서 §8).
       * 검사에서 걸러진 것들과 같은 목록에 같은 방식으로 올린다.
       */
      if (failed.length) {
        skipped.value = [...skipped.value, ...failed.map((n) => ({ name: n, reason: 'open-failed' as const }))]
      }
      return
    }
    if (stage.value === 'loading') stage.value = 'idle'
  }

  async function selectFiles(sources: readonly PhotoSource[]) {
    reset()
    stage.value = 'scanning'
    scanProgress.value = { done: 0, total: sources.length }
    // 이 기록에 이미 들어 있는 사진들 — 같은 사진을 또 올리는 걸 여기서 막는다.
    // 서버를 새로 부르지 않는다: 편집 화면이 이미 사진마다 shot_at·좌표를 들고 있다.
    const existingKeys = new Set(
      points.value.flatMap((pt) =>
        pt.photos
          .filter((ph) => ph.shot_at)
          .map((ph) => photoKey({ shotAt: ph.shot_at!, lat: ph.lat, lng: ph.lng })),
      ),
    )
    const scan = await scanFiles(sources, (done, total) => {
      scanProgress.value = { done, total }
    }, { inPost: existingKeys, limit: opts.limit })
    scanned.value = scan.passed
    skipped.value = scan.skipped
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
    // 서버가 곧 다시 계산할 값이다 — 되돌릴 길을 여기서 확보해 둔다 (AddPhotosOptions.period)
    periodBefore = opts.period?.value ? { ...opts.period.value } : null

    const shots = scanned.value
    const byKey = new Map(shots.map((s) => [s.key, s]))
    const ext = outputExt()

    const pick = (s: ClusterInput) => {
      const shot = byKey.get(s.key)
      return shot ? toInput(shot, ext) : null
    }
    const notNull = (p: UploadPhotoInput | null): p is UploadPhotoInput => p !== null

    /*
     * 「이 포인트로」 모드에서는 배정을 아예 하지 않는다. 좌표가 얼마나 떨어져 있든
     * 고른 사진 전부가 그 포인트로 간다 — 거리로는 안 묶이는 것을 맥락으로 묶는 자리다.
     * (서버의 joins 경로가 이미 「중심 좌표는 건드리지 않고 뒤에 붙인다」를 한다.)
     */
    const forced = opts.pointId?.value ?? null
    const body: AddPhotosInput = forced !== null
      ? { joins: [{ pointId: forced, photos: shots.map(pick).filter(notNull) }], news: [] }
      : {
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
    // 껍데기가 남긴 원본 사본을 놓는다 — 재시도가 없을 때만
    if (!failed.value.length) void releaseSources(shots.map((s) => s.src))
    result.value = {
      photos: shots.length,
      joined: assignment.value.joinedShots,
      created: assignment.value.news.length,
      // 상한에 걸려 이번에 못 올린 장수 — 완료 화면이 「이어서 추가」를 주 버튼으로 세울 근거다
      leftover: skipped.value.reduce((n, sk) => (sk.reason === 'over-limit' ? n + 1 : n), 0),
    }
    stage.value = 'done'
  }

  /** 사진 1장: 리사이즈 → PUT. Blob 은 이 함수를 벗어나면 참조가 끊겨 회수된다. */
  async function uploadOne(shot: ScannedPhoto, id: number) {
    let display: Blob, thumb: Blob, w: number, h: number, dExt: string, tExt: string
    try {
      const d = await resizePhoto(shot.src)
      ;({ blob: display, w, h, ext: dExt } = d.display)
      ;({ blob: thumb, ext: tExt } = d.thumb)
    } catch {
      failed.value.push({ key: shot.key, name: shot.name, bytes: sourceSize(shot.src), reason: '변환 실패' })
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

  /**
   * 「N장 재시도」 — 실패한 것만 다시 올린다. 원본은 그대로 있으므로 다시 리사이즈한다.
   * 🔴 도는 동안 stage 를 uploading 으로 되돌린다. 그래야 진행 화면이 「업로드 중」을 그리고
   *    조치 버튼이 숨는다 — 재시도 중에 다시 「전부 취소」가 눌리면 올라가는 중인 사진의
   *    행을 지우게 된다. 화면 없이 오버레이만 쓰는 편집 화면 경로도 이걸로 바빠진다.
   */
  async function retryFailed() {
    const byKey = new Map(scanned.value.map((s) => [s.key, s]))
    const targets = [...failed.value]
    failed.value = []
    stage.value = 'uploading'
    for (const f of targets) {
      const id = photoIds.value[f.key]
      const shot = byKey.get(f.key)
      if (id != null && shot) await uploadOne(shot, id)
    }
    stage.value = 'done'
  }

  /**
   * 「전부 취소」 — 이번에 붙인 사진을 «성공분까지» 전부 지우고 2단계로 되돌린다.
   *
   * 예전에는 여기가 「건너뛰고 저장」이었다. 실패한 행만 지우면 반쯤 붙은 상태가 남는데,
   * 그러면 이 기록에서 무엇이 빠졌는지 나중에 알 방법이 없다 (useUploadFlow 의 같은
   * 이름 함수 주석 참고). 빈 포인트는 서버가 함께 지운다.
   *
   * 🔴 사진만 지우면 «없던 일»이 아니다. 붙이는 쪽이 기록의 기간을 사진에 맞춰 다시
   *    계산했으므로(AddPhotosOptions.period) 그 값도 되돌린다 — 안 그러면 사진은 없는데
   *    기간만 넓은 기록이 남는다. 사진 삭제 엔드포인트에서 일괄 재계산하지 않는 이유는
   *    그쪽이 손으로 정한 기간까지 덮어쓰기 때문이다 (photos/index.delete.ts 의 🔴).
   *
   * 🔴 부른 쪽은 이 뒤에 기록을 다시 받아야 한다. 확정이 끝나면 화면이 이미 한 번
   *    새로 받았으므로 방금 지운 포인트가 목록에 유령으로 남아 있다.
   *
   * 고른 사진과 원본은 놓지 않는다 — 곧바로 다시 확정할 수 있어야 한다.
   */
  async function cancelUpload() {
    const ids = Object.values(photoIds.value)
    if (ids.length) await $fetch('/api/photos', { method: 'DELETE', body: { ids } })
    if (periodBefore) await $fetch(`/api/posts/${slug.value}`, { method: 'PATCH', body: periodBefore })
    periodBefore = null
    photoIds.value = {}
    failed.value = []
    uploaded.value = 0
    totalPhotos.value = 0
    result.value = null
    stage.value = 'preview'
  }

  return {
    stage, scanned, skipped, radius, assignment, radiusTable, totalAfter,
    scanProgress, loadProgress, uploaded, totalPhotos, uploadPercent, failed, errorMessage, result,
    pick, selectFiles, confirm, retryFailed, cancelUpload, reset,
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
