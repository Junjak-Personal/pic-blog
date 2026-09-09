import { centroid } from './cluster.ts'

export type AnchorPick = 'cover' | 'centroid'
type Spot = { lat: number; lng: number }

/** 대표 지정이 없거나 사진이 옮겨졌으면 현재 첫 사진을 사용한다. */
export function representativePhoto<T extends { id: number }>(photos: readonly T[], coverId: number | null): T | null {
  return photos.find((p) => p.id === coverId) ?? photos[0] ?? null
}

/** 기존 위치는 보존한다. 새 포인트와 사진 한 장인 포인트의 기본은 대표 사진이다. */
export function pointAnchor(
  photos: readonly (Spot & { id: number })[],
  coverId: number | null,
  saved: Spot | null,
  pick: AnchorPick | null,
): Spot | null {
  const cover = representativePhoto(photos, coverId)
  if (!cover) return null
  if (photos.length === 1 || pick === 'cover' || (!saved && pick !== 'centroid')) {
    return { lat: cover.lat, lng: cover.lng }
  }
  if (pick === 'centroid') return centroid(photos)
  return saved
}
