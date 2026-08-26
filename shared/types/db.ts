/** SQLite row shapes — 설계 문서 §3 스키마와 1:1. */

export interface PostRow {
  id: number
  slug: string
  title: string
  summary: string | null
  cover_photo_id: number | null
  started_at: string | null
  ended_at: string | null
  is_public: number
  /** 이 기록을 묶을 때 쓴 클러스터 반경(m). 업로드 이전 기록은 null. */
  cluster_radius: number | null
  created_at: string
  updated_at: string
}

export interface PointRow {
  id: number
  post_id: number
  lat: number
  lng: number
  title: string | null
  body: string | null
  /** JSON 배열 문자열. 읽을 때 parseTags() 로 좁힌다. */
  tags: string
  first_shot_at: string | null
  order_index: number
}

export interface PhotoRow {
  id: number
  point_id: number
  display_path: string
  thumb_path: string
  w: number
  h: number
  lat: number
  lng: number
  shot_at: string | null
  camera: string | null
  f_number: number | null
  exposure: string | null
  iso: number | null
  order_index: number
}

/** API 응답 — tags 를 배열로 편 형태. */
export interface Photo extends Omit<PhotoRow, 'point_id'> {}

export interface Point extends Omit<PointRow, 'tags' | 'post_id'> {
  tags: string[]
  photos: Photo[]
}

export interface PostSummary extends Omit<PostRow, 'is_public'> {
  is_public: boolean
  point_count: number
  photo_count: number
  distance_km: number
  cover_thumb: string | null
  cover_display: string | null
  /** 지도 초기 중심 [lng, lat] — Mapbox 규약 순서 */
  center: [number, number] | null
}

export interface PostDetail extends PostSummary {
  points: Point[]
}
