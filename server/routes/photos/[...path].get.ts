/**
 * 사진 파일 서빙. Nitro 가 디스크에서 바로 읽는다 — 이미지 처리는 하지 않는다.
 * 파일명에 photo.id 가 들어 있어 내용이 바뀌지 않으므로 길게 캐시한다.
 *
 * 🔴 비공개 기록의 사진도 여기로 나간다. slug 는 `record-YYYYMMDD` 로 추측되고
 *    photo.id 는 1부터 연번이라, 공개 여부를 안 보면 /api/posts 가 403 을 줘도
 *    사진은 그대로 열린다. 실제로 그랬다 — 경로에서 slug 를 뽑아 먼저 확인한다.
 */
import { createReadStream, statSync } from 'node:fs'

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'path') ?? ''
  // 경로 조작 차단 — {slug}/{id}_{variant}.{ext} 형태만 허용한다
  if (!/^[a-z0-9][a-z0-9-]{0,80}\/\d+_(display|thumb)\.(webp|jpe?g)$/.test(raw)) {
    throw createError({ statusCode: 400, statusMessage: '잘못된 사진 경로' })
  }

  // 비공개 기록이면 편집 세션이 있어야 한다. 없는 slug 는 아래 statSync 가 404 로 받는다.
  const slug = raw.split('/')[0]!
  const post = useDb()
    .prepare<[string], { is_public: number }>(`SELECT is_public FROM post WHERE slug = ?`)
    .get(slug)
  if (post && !post.is_public) {
    await requireUserSession(event)
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
    // 비공개 기록의 사진은 공유 캐시(CDN·프록시)에 남으면 안 된다
    'cache-control': post && !post.is_public
      ? 'private, max-age=0, no-store'
      : 'public, max-age=31536000, immutable',
  })
  return sendStream(event, createReadStream(abs))
})
