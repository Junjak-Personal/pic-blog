import type { PostSummary } from '../types/db.ts'

export const SITE_NAME = 'pic·blog'
export const SITE_TITLE = 'pic·blog — 사진 좌표 기반 여행 로그'
export const SITE_DESCRIPTION = '사진과 장소를 지도 위에 남기는 개인 여행 기록. 촬영한 사진의 GPS와 시간으로 여행 동선을 따라가며 장소별 사진과 이야기를 살펴보세요.'
export const PUBLIC_ROBOTS = 'index, follow, max-image-preview:large'

export function absoluteSiteUrl(path: string, siteUrl: string) {
  return new URL(path, siteUrl).href
}

export function postDescription(post: Pick<PostSummary, 'title' | 'summary' | 'point_count' | 'photo_count'>) {
  const text = post.summary?.trim()
    || `${post.title}. ${post.point_count}곳의 여행 포인트와 사진 ${post.photo_count}장으로 남긴 여행 기록.`
  const normalized = text.replace(/\s+/g, ' ').trim()
  const characters = Array.from(normalized)
  return characters.length > 160 ? `${characters.slice(0, 159).join('')}…` : normalized
}

/** 사용자 문구에 </script> 가 있어도 JSON-LD 밖으로 빠져나가지 못하게 한다. */
export function serializeJsonLd(data: object) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
