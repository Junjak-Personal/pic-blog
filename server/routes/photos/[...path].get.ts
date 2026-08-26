/**
 * 사진 파일 서빙. Nitro 가 디스크에서 바로 읽는다 — 이미지 처리는 하지 않는다.
 * 파일명에 photo.id 가 들어 있어 내용이 바뀌지 않으므로 길게 캐시한다.
 */
import { createReadStream, statSync } from 'node:fs'

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
}

export default defineEventHandler((event) => {
  const raw = getRouterParam(event, 'path') ?? ''
  // 경로 조작 차단 — {slug}/{id}_{variant}.{ext} 형태만 허용한다
  if (!/^[a-z0-9][a-z0-9-]{0,80}\/\d+_(display|thumb)\.(webp|jpe?g)$/.test(raw)) {
    throw createError({ statusCode: 400, statusMessage: '잘못된 사진 경로' })
  }

  const abs = photoAbsPath(raw)
  let size: number
  try {
    size = statSync(abs).size
  } catch {
    throw createError({ statusCode: 404, statusMessage: '사진 파일이 없습니다' })
  }

  const ext = raw.split('.').pop() ?? 'webp'
  setHeaders(event, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'public, max-age=31536000, immutable',
  })
  return sendStream(event, createReadStream(abs))
})
