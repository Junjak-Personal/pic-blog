/**
 * OAuth·MCP 공용 (Memo OAuth 기법을 Picblog 단일 오너 모델에 적용).
 * 이 앱이 MCP 서버이면서 자기 인증 서버다 — 발급자(issuer)는 앱 주소, 보호 자원(resource)은 `<앱 주소>/mcp`.
 */
import { join, resolve } from 'node:path'
import type { H3Event } from 'h3'
import { OAuthGrants } from '../oauth/grants'

export const MCP_SCOPE = 'picblog'

let grants: OAuthGrants | null = null
let ready: Promise<void> | null = null

export async function useOAuthGrants() {
  if (!grants) {
    const { dataDir } = useRuntimeConfig()
    grants = new OAuthGrants(resolve(join(dataDir, 'oauth')))
    ready = grants.init()
  }
  await ready
  return grants
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * 앱 주소. 운영은 NUXT_SITE_URL(https://pic-blog.jun-devlog.win) — 터널 뒤라 요청 주소는 http://localhost 로 보인다.
 * 🔴 비어 있으면 요청에서 짐작하되 로컬 주소일 때만, X-Forwarded-* 는 믿지 않는다 — 요청의 Host 를 그대로 발급자로 쓰면 남이 만든
 *    Host 로 찾기 문서·토큰의 받을 곳을 바꿀 수 있다 (2026-10-16 보안 검토). 운영에서 설정이 빠졌으면 AI 연결을 멈춘다.
 */
export function oauthUrls(event: H3Event) {
  const { siteUrl } = useRuntimeConfig()
  let origin = siteUrl
  if (!origin) {
    const url = getRequestURL(event, { xForwardedHost: false, xForwardedProto: false })
    if (process.env.NODE_ENV === 'production' || !LOCAL_HOSTS.has(url.hostname)) throw createError({ statusCode: 503, data: { message: 'NUXT_SITE_URL 이 없어 AI 연결을 쓸 수 없습니다' } })
    origin = url.origin
  }
  const parsed = new URL(origin)
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname)))) {
    throw createError({ statusCode: 503, statusMessage: '잘못된 NUXT_SITE_URL 설정입니다' })
  }
  const issuer = parsed.origin
  return {
    issuer,
    resource: `${issuer}/mcp`,
    resourceMetadata: `${issuer}/.well-known/oauth-protected-resource/mcp`,
  }
}

/** 허용한 클라이언트 신원 문서의 출처 — 기본 claude.ai (웹·폰·Desktop·Claude Code)·chatgpt.com */
export function clientOrigins() {
  // runtimeConfig.oauth 는 nuxt-auth-utils 가 쓰는 자리라 mcp 아래에 둔다
  const { mcp } = useRuntimeConfig()
  return String(mcp.clientOrigins)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

/**
 * 클라이언트가 보낸 resource 가 이 서버인가 — MCP 주소(`…/mcp`) 또는 서버 주소 자체.
 * OpenAI 문서는 ChatGPT 가 `resource=https://your-mcp.example.com` 처럼 서버 주소만 보낸다고 적는다. 어느 쪽이든 발급하는 토큰의
 * 받을 곳(aud)은 언제나 MCP 주소 하나다.
 */
export function isOurResource(requested: string, urls: { issuer: string; resource: string }) {
  return sameResource(requested, urls.resource) || sameResource(requested, urls.issuer)
}

/**
 * 토큰 요청의 클라이언트 id. 보통은 client_id 로 오지만, ChatGPT 처럼 서명 단언(private_key_jwt)을 기본으로 쓰는 클라이언트는
 * client_assertion 만 보낼 수 있다 — 그때는 단언의 sub(= client_id)를 읽는다. 서명은 확인하지 않는다: 이 서버는 공개 클라이언트만
 * 받고, 코드를 내주는 일은 승인 때의 client_id·돌아갈 주소·PKCE 가 다 맞아야 하므로 id 를 바꿔 쳐도 얻는 것이 없다.
 */
export function tokenClientId(body: { client_id?: string; client_assertion?: string }) {
  if (body.client_id) return body.client_id
  const payload = body.client_assertion?.split('.')[1]
  if (!payload) return ''
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const sub = typeof claims === 'object' && claims !== null ? (claims as Record<string, unknown>).sub : undefined
    return typeof sub === 'string' ? sub : ''
  } catch {
    return ''
  }
}

/** resource 값 비교 — 끝의 빗금과 스킴·호스트의 대소문자는 가리지 않는다 */
export function sameResource(a: string, b: string) {
  try {
    const left = new URL(a)
    const right = new URL(b)
    return !left.username && !left.password && !left.search && !left.hash
      && left.origin === right.origin
      && left.pathname.replace(/\/+$/, '') === right.pathname.replace(/\/+$/, '')
  } catch { return false }
}

/** Cookie-authenticated consent/revocation must originate from this app. */
export function requireOAuthOrigin(event: H3Event) {
  if (getRequestHeader(event, 'origin') !== oauthUrls(event).issuer) {
    throw createError({ statusCode: 403, statusMessage: '같은 사이트에서만 연결을 변경할 수 있습니다' })
  }
}

/** 로그에 넣는 바깥 값 — 줄바꿈·제어 문자를 빼고 자른다 (요청이 로그 줄을 꾸며 내지 못하게) */
export function logValue(value: string | undefined, max = 160) {
  return (value ?? '-').replace(/[^\x20-\x7e가-힣]/g, '?').slice(0, max) || '-'
}

/**
 * AI 연결 단계 기록 — 어디서 멈췄는지 보려고 (ChatGPT 가 토큰까지 오지 못한 원인 조사, 2026-10-18).
 * ray 는 Cloudflare 요청 번호 — Cloudflare 보안 이벤트와 맞춰 본다. 🔴 토큰·승인 코드·PKCE 값·쿠키는 적지 않는다.
 */
export function oauthLog(event: H3Event, message: string) {
  const ua = logValue(getRequestHeader(event, 'user-agent'), 120)
  const ray = logValue(getRequestHeader(event, 'cf-ray'), 40)
  console.info(`[oauth] ${message} ua="${ua}" ray=${ray}`)
}

/** Token requests are tiny; reject chunked oversized bodies before buffering. */
export async function readOAuthBody(event: H3Event) {
  const type = (getRequestHeader(event, 'content-type') ?? '').split(';')[0]?.toLowerCase()
  if (type !== 'application/x-www-form-urlencoded') throw createError({ statusCode: 415 })
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of event.node.req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 16 * 1024) throw createError({ statusCode: 413 })
    chunks.push(bytes)
  }
  const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  const body: Record<string, string> = {}
  for (const [key, value] of params) {
    if (Object.hasOwn(body, key)) throw createError({ statusCode: 400, statusMessage: 'Duplicate parameter' })
    Object.defineProperty(body, key, { value, enumerable: true })
  }
  return body
}
