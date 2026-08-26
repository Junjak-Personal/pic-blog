/** 업로드 확정 페이로드 — 클라이언트가 클러스터링을 끝내고 보내는 매니페스트. 바이트는 별도 전송. */

export interface UploadPhotoInput {
  /** 업로드 세션 키 — 서버가 배정한 photo.id 를 이 키로 되돌려준다 */
  key: string
  /** display 픽셀 크기는 매니페스트에 없다 — 바이트 PUT 이 채운다.
      매니페스트가 크기를 요구하면 클라이언트가 전 장을 미리 리사이즈해 들고 있어야 해서
      200장 배치가 메모리 상한에 걸렸다. 지금은 한 장씩 리사이즈 → PUT → 해제한다. */
  displayExt: string
  thumbExt: string
  lat: number
  lng: number
  shot_at: string | null
  camera: string | null
  f_number: number | null
  exposure: string | null
  iso: number | null
}

export interface UploadPointInput {
  /** 확정된 앵커. 저장된 뒤에는 사진이 붙어도 움직이지 않는다 (설계문서 §4.2) */
  lat: number
  lng: number
  title: string | null
  first_shot_at: string | null
  photos: UploadPhotoInput[]
}

export interface CreatePostInput {
  title: string
  points: UploadPointInput[]
}

export interface CreatePostResult {
  slug: string
  postId: number
  /** 업로드 세션 키 → photo.id */
  photoIds: Record<string, number>
}

/** 사진 추가 (아트보드 1f) — 기존 포스트에 붙인다. */
export interface AddPhotosInput {
  /** 기존 포인트에 합류하는 사진들 */
  joins: { pointId: number; photos: UploadPhotoInput[] }[]
  /** 새로 생기는 포인트들 */
  news: UploadPointInput[]
}
