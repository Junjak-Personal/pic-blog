import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * 키보드 진단 수집 — 개발 서버에서만 산다.
 *
 * 폰에서만 나는 문제라 기기에서 벌어진 «사건 순서»를 봐야 하는데, 그걸 스샷으로 받으면
 * 사람이 한 번 더 움직여야 한다. 그냥 파일로 받는다 — 폰에서 한 번 누르면 여기 쌓인다.
 *
 * 🔴 운영에서는 404 다. 인증도 없는 쓰기 경로라 열려 있으면 안 된다.
 */
const LOG = resolve(process.cwd(), '_workspace/kbprobe.log')

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  const body = await readBody<{ label?: unknown; lines?: unknown }>(event)
  const lines = Array.isArray(body?.lines) ? body.lines.filter((v): v is string => typeof v === 'string') : []
  if (!lines.length) return { ok: true, lines: 0 }

  const label = typeof body?.label === 'string' ? body.label : '-'
  const stamp = new Date().toISOString()
  mkdirSync(dirname(LOG), { recursive: true })
  appendFileSync(LOG, `\n=== ${stamp} · ${label} ===\n${lines.join('\n')}\n`)
  return { ok: true, lines: lines.length }
})
