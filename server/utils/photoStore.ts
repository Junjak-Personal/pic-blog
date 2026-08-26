/**
 * 사진 파일 저장 — 서버는 받은 바이트를 디스크에 쓰기만 한다. 디코드/인코드 없음 (제약 #1).
 * 레이아웃: {dataDir}/photos/{post_slug}/{photo_id}_{display|thumb}.{ext}
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type Variant = 'display' | 'thumb'

/** 경로 조작 차단 — slug 는 DB 에서 오지만 파일 경로에 쓰이므로 한 번 더 좁힌다. */
function safeSlug(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: `잘못된 slug: ${slug}` })
  }
  return slug
}

/** DB 에 저장되는 상대 경로. 웹에서는 /photos/... 로 서빙된다. */
export function photoRelPath(slug: string, photoId: number, variant: Variant, ext: string) {
  return `${safeSlug(slug)}/${photoId}_${variant}.${ext}`
}

export function photoAbsPath(relPath: string) {
  return join(photosDir(), relPath)
}

export function writePhotoBytes(relPath: string, bytes: Buffer) {
  const abs = photoAbsPath(relPath)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, bytes)
}

export function removePhotoFiles(relPaths: readonly string[]) {
  for (const rel of relPaths) {
    if (!rel) continue
    rmSync(photoAbsPath(rel), { force: true })
  }
}

export function removePostDir(slug: string) {
  rmSync(join(photosDir(), safeSlug(slug)), { recursive: true, force: true })
}
