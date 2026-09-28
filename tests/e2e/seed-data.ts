/** E2E 시드가 만드는 기록 — seed.ts 와 spec 이 같이 읽는다. 부수 효과가 없어야 spec 이 import 할 수 있다. */
export const SEED = {
  public: { id: 1, slug: 'e2e-public', title: 'E2E 공개 기록', photoId: 1 },
  private: { id: 2, slug: 'e2e-private', title: 'E2E 비공개 기록', photoId: 2 },
  /** 로그인 spec 이 제목을 고치는 기록 — 다른 spec 이 보는 기록을 건드리지 않으려고 따로 둔다 */
  editable: { id: 3, slug: 'e2e-editable', title: 'E2E 편집용 기록', photoId: 3 },
} as const

export type SeedPost = (typeof SEED)[keyof typeof SEED]

export const photoPath = (post: SeedPost, variant: 'display' | 'thumb') =>
  `/photos/${post.slug}/${post.photoId}_${variant}.jpg`

/**
 * E2E 서버 전용 편집 비밀번호. 🔴 운영·로컬의 실제 비밀번호가 아니다 — 저장소가 공개라서
 * 실제 값은 여기 절대 적지 않는다. playwright.config 가 아래 해시를 E2E 서버에만 넣는다.
 * 해시: `node scripts/hash-password.mjs '<EDITOR_PASSWORD>'`
 */
export const EDITOR_PASSWORD = 'e2e-only-password-not-real'
export const EDITOR_PASSWORD_HASH =
  '$scrypt$n=16384,r=8,p=1$PsJhxIzID4ka1EGBqt/VaQ$LKluW/+jSs3kg8BJc0Gw3PaGNCT2RG3kZTf9tE/8aGNP9daw001Vnfc0jVBBWBY7YECb78SWsPF6Va2AmImPNw'
