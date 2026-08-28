/**
 * 네이티브 껍데기(app-ios) 다리.
 *
 * 왜 있는가: 웹뷰의 <input type=file> 로 사진을 받으면 iOS 가 HEIC 를 24MP JPEG 으로
 * 변환해서 넘긴다 — 200장이면 그것만 62초고, 우리는 그 JPEG 을 곧바로 2048px 로 줄여
 * 버린다. accept 를 어떻게 줘도 끌 수 없다(실측). 껍데기는 PhotoKit 으로 «원본»을 골라
 * 주고, 나머지(EXIF·클러스터·리사이즈·업로드)는 전부 이 웹앱이 지금 코드 그대로 한다.
 * 그래서 photoKey 같은 판정 규칙이 두 벌이 되지 않는다.
 *
 * 껍데기가 아닌 곳(사파리·데스크탑)에서는 bridge() 가 null 이고 전부 원래 경로로 간다.
 */

/** 껍데기가 pick 으로 돌려주는 한 장. 바이트는 아직 없다 — 손잡이만 있다. */
export interface NativePhoto {
  token: string
  name: string
  size: number
}

interface NativeApi {
  version: number
  /** 검사에 넘길 앞부분 크기 (바이트) */
  headerBytes: number
  /**
   * 고르고 나서 원본을 꺼내는 동안 껍데기가 부른다.
   * 500장이면 그 구간만 여러 초라, 없으면 화면이 통째로 조용하다.
   */
  onPickProgress: ((done: number, total: number) => void) | null
  /**
   * 🔴 반환은 «배열»이다. 껍데기는 기기에 설치돼 있고 웹은 따로 배포되므로 둘의 버전은
   *    언제든 어긋난다 — 이 모양을 바꾸면 옛 웹이 새 앱에서(또는 그 반대로) 죽는다.
   *    실제로 한 번 그렇게 「사진을 가져오는 중」에서 멈췄다. 새 정보는 아래처럼 따로 낸다.
   */
  pick: (limit: number) => Promise<NativePhoto[]>
  /** 방금 고르기에서 원본을 못 꺼낸 사진 이름. 옛 껍데기에는 없을 수 있다. */
  lastPickFailed?: string[]
  /**
   * limit  — 원본의 앞부분만 (검사)
   * render — PhotoKit 이 그 크기로 그린 JPEG (변환)
   */
  readBlob: (token: string, opts?: { limit?: number; render?: number }) => Promise<Blob>
  release: (tokens: readonly string[]) => Promise<void>
}

/**
 * 껍데기 안이면 다리를, 아니면 null.
 *
 * 🔴 모듈 상단에서 한 번 읽어 캐시하면 안 된다. 껍데기는 페이지가 «선 뒤에» 브리지를
 *    심는다(onPageFinished). 그 전에 읽으면 영원히 null 인 채로 굳는다.
 */
export function nativeBridge(): NativeApi | null {
  if (import.meta.server) return null
  const api = (globalThis as { picblogNative?: NativeApi }).picblogNative
  return api && typeof api.pick === 'function' ? api : null
}

/**
 * 사진의 «원본을 읽는 법».
 *
 * 웹에서는 File 이고, 껍데기에서는 토큰이다. File 은 디스크 백업이라 200장을 들고 있어도
 * RAM 을 안 쓰는데, 껍데기 쪽도 같은 성질을 지켜야 한다 — 그래서 바이트를 미리 받아두지
 * 않고 필요한 시점에 필요한 만큼만 브리지로 가져온다.
 */
export type PhotoSource =
  | { kind: 'file'; file: File }
  | { kind: 'native'; photo: NativePhoto }

export function sourceName(src: PhotoSource) {
  return src.kind === 'file' ? src.file.name : src.photo.name
}

export function sourceSize(src: PhotoSource) {
  return src.kind === 'file' ? src.file.size : src.photo.size
}

/** 네이티브 사진이면 그 토큰 — 업로드가 끝나고 사본을 지울 때 쓴다 */
export function sourceToken(src: PhotoSource) {
  return src.kind === 'native' ? src.photo.token : null
}

/**
 * 검사(EXIF)에 줄 것. File 은 exifr 가 알아서 부분만 읽으므로 그대로 넘기고,
 * 네이티브는 헤더만 가져온다 — HEIC 는 64KB 로도 GPS·촬영시각이 다 나온다(실측).
 */
export function headerOf(src: PhotoSource): Promise<Blob> {
  if (src.kind === 'file') return Promise.resolve(src.file)
  const api = nativeBridge()
  if (!api) return Promise.reject(new Error('네이티브 다리가 없습니다'))
  return api.readBlob(src.photo.token, { limit: api.headerBytes })
}

/**
 * 변환(리사이즈)에 줄 것. 한 장씩 받고 바로 버린다.
 *
 * 껍데기에서는 원본을 통째로 넘기지 않고 PhotoKit 에 renderMax 로 그려 달라고 한다.
 * 48MP 원본을 넘기면 장당 519ms 인데 2048px 로 그리면 147ms 다 — 브리지가 257→100,
 * 디코딩이 213→15 로 같이 무너지고, 원본이 24MP 든 48MP 든 결과가 같아진다 (실측).
 *
 * 🔴 크기는 «부르는 쪽»이 준다. 앱이 자기 상수를 갖는 순간 「화면 크기」가 두 곳에 생긴다 —
 *    DISPLAY_MAX 는 resize.ts 하나뿐이어야 한다. (여기서 import 하면 순환이 된다.)
 */
export function bytesOf(src: PhotoSource, renderMax?: number): Promise<Blob> {
  if (src.kind === 'file') return Promise.resolve(src.file)
  const api = nativeBridge()
  if (!api) return Promise.reject(new Error('네이티브 다리가 없습니다'))
  return api.readBlob(src.photo.token, { render: renderMax })
}

/** 업로드가 끝난 사본을 껍데기에서 지운다. 웹 경로에서는 할 일이 없다. */
export async function releaseSources(sources: readonly PhotoSource[]) {
  const api = nativeBridge()
  if (!api) return
  const tokens = sources.map(sourceToken).filter((t): t is string => t !== null)
  if (tokens.length) await api.release(tokens)
}

/**
 * 사진을 고른다 — 껍데기면 PhotoKit, 아니면 <input type=file>.
 *
 * 둘 다 PhotoSource[] 로 돌려주므로 부르는 쪽은 어느 경로인지 몰라도 된다.
 * 취소하면 빈 배열이다.
 *
 * 🔴 input.click() 은 사용자 제스처 «안에서» 불려야 사파리가 막지 않는다. 이 함수는
 *    앞에 await 를 두지 않으므로 클릭 핸들러에서 바로 부르면 된다.
 */
/** 고른 결과. failed 는 껍데기가 «원본을 못 꺼낸» 사진 이름 — 조용히 버리지 않는다. */
export interface PickResult {
  sources: PhotoSource[]
  failed: string[]
}

export function pickPhotos(
  input: HTMLInputElement | null,
  limit: number,
  /** 껍데기가 원본을 꺼내는 동안의 진행. 브라우저 경로에서는 불리지 않는다. */
  onProgress?: (done: number, total: number) => void,
): Promise<PickResult> {
  const api = nativeBridge()
  if (api) {
    api.onPickProgress = onProgress ?? null
    return api
      .pick(limit)
      .then((photos) => ({
        sources: photos.map((photo) => ({ kind: 'native', photo }) as const),
        // 옛 껍데기에는 이 창이 없다 — 없으면 빈 배열로 읽는다
        failed: api.lastPickFailed ?? [],
      }))
      .finally(() => {
        api.onPickProgress = null
      })
  }
  return new Promise((resolve) => {
    if (!input) {
      resolve({ sources: [], failed: [] })
      return
    }
    const finish = (sources: PhotoSource[]) => {
      input.removeEventListener('change', onChange)
      input.removeEventListener('cancel', onCancel)
      resolve({ sources, failed: [] })
    }
    const onChange = () => finish([...(input.files ?? [])].map((file) => ({ kind: 'file', file }) as const))
    // 고르지 않고 닫은 경우. 없으면 promise 가 영영 안 풀린다.
    const onCancel = () => finish([])
    input.addEventListener('change', onChange)
    input.addEventListener('cancel', onCancel)
    // 같은 파일을 다시 골라도 change 가 뜨게 비워둔다
    input.value = ''
    input.click()
  })
}
