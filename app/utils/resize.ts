/**
 * 업로드 2단계 — 클라이언트 canvas 리사이즈. 서버에 sharp/libvips 를 설치하지 않는 이유가 이것이다.
 * display(2048px) + thumb(400px) WebP 만 만든다. 원본은 보관하지 않는다 (설계문서 §5.3).
 */

import { bytesOf, type PhotoSource } from '~/utils/native'

export const DISPLAY_MAX = 2048
export const THUMB_MAX = 400

let cachedExt: string | null = null

/**
 * 이 브라우저가 WebP 로 인코딩할 수 있는지 한 번만 판정한다.
 *
 * 이게 왜 사진마다가 아니라 브라우저당 한 번이어야 하냐면 — 파일 확장자가 매니페스트에
 * 들어가고(서버가 그걸로 경로와 content-type 을 정한다) 매니페스트는 리사이즈보다 먼저 간다.
 * 사진마다 폴백이 갈리면 .webp 로 이름 붙은 jpeg 이 나올 수 있다. 인코더 지원 여부는
 * 사진이 아니라 브라우저의 성질이므로 한 번 정해서 전 장에 똑같이 쓴다.
 */
export function outputExt() {
  if (cachedExt) return cachedExt
  const ok = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp')
  cachedExt = ok ? 'webp' : 'jpeg'
  return cachedExt
}

export interface Derivative {
  blob: Blob
  w: number
  h: number
  /** 'webp' | 'jpeg' — outputExt() 가 브라우저당 한 번 정한 값 */
  ext: string
}

export interface ResizedPhoto {
  display: Derivative
  thumb: Derivative
}

function scaleTo(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { w, h }
  const r = w >= h ? max / w : max / h
  return { w: Math.round(w * r), h: Math.round(h * r) }
}

/**
 * canvas.toBlob 은 콜백이고 null 을 줄 수 있다. 포맷은 outputExt() 가 이미 정해뒀으므로
 * 여기서 다른 포맷으로 갈아타지 않는다 — 실패하면 그 사진만 실패 목록으로 보낸다.
 */
function encode(canvas: HTMLCanvasElement): Promise<Derivative> {
  const ext = outputExt()
  const [type, quality] = ext === 'webp' ? ['image/webp', 0.8] as const : ['image/jpeg', 0.82] as const
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`canvas encode failed (${type})`))
          return
        }
        resolve({ blob, w: canvas.width, h: canvas.height, ext })
      },
      type,
      quality,
    )
  })
}

async function draw(bitmap: ImageBitmap, max: number) {
  const { w, h } = scaleTo(bitmap.width, bitmap.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  return encode(canvas)
}

/**
 * 🔴 `imageOrientation: 'from-image'` 가 없으면 canvas 가 EXIF Orientation 을 무시해서
 *    아이폰 세로 사진이 전부 눕는다. 이 옵션이 이 파일에서 제일 중요한 한 줄이다.
 *
 * 원본 바이트는 «여기서» 가져온다. 껍데기 경로에서는 브리지가 그때 한 장을 건네주고,
 * 이 함수를 벗어나면 참조가 끊겨 회수된다 — 전 장을 미리 받아두면 200장 × 2.75MB 가
 * 메모리에 쌓인다 (설계문서: 107MB 로 iOS 탭이 죽은 적이 있다).
 */
export async function resizePhoto(src: PhotoSource): Promise<ResizedPhoto> {
  const bitmap = await createImageBitmap(await bytesOf(src), { imageOrientation: 'from-image' })
  try {
    return {
      display: await draw(bitmap, DISPLAY_MAX),
      thumb: await draw(bitmap, THUMB_MAX),
    }
  } finally {
    bitmap.close()
  }
}
