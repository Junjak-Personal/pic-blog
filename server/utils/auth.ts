/**
 * 편집 인증 — 비밀번호 1개 + httpOnly 세션 쿠키 (설계문서 §7).
 * 해시·검증은 nuxt-auth-utils 의 scrypt(@adonisjs/hash)를 그대로 쓴다.
 * 평문 비밀번호는 어디에도 저장하지 않는다. env 에는 해시만 들어간다.
 */
import type { H3Event } from 'h3'

/** 쓰기 엔드포인트 전부가 이 한 줄을 지나간다. 읽기 경로는 절대 부르지 않는다. */
export async function requireEditor(event: H3Event) {
  await requireUserSession(event)
}
