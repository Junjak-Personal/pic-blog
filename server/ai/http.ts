import type { H3Event } from 'h3'
import { PhotoAiError } from './plan'
import { PhotoAiService } from './service'
import { claudeProvider } from './provider'
import { requireEditor } from '../utils/auth'
import { useDb, photosDir } from '../utils/db'

export async function aiRequest(event: H3Event, action: 'get' | 'propose' | 'apply' | 'undo' | 'cancel') {
  await requireEditor(event)
  setHeader(event,'cache-control','no-store')
  const config = useRuntimeConfig(event)
  if (action !== 'get') {
    if (getHeader(event,'content-type')?.split(';')[0]?.trim() !== 'application/json') throw createError({ statusCode: 415, statusMessage: 'JSON 요청이 필요합니다' })
    const origin = getHeader(event,'origin')
    const expected = config.siteUrl ? new URL(config.siteUrl).origin : getRequestURL(event,{ xForwardedHost: false, xForwardedProto: false }).origin
    if (!origin || origin !== expected) throw createError({ statusCode: 403, statusMessage: '다른 사이트에서 AI 작업을 실행할 수 없습니다' })
    if (getHeader(event,'sec-fetch-site') === 'cross-site') throw createError({ statusCode: 403, statusMessage: '다른 사이트에서 AI 작업을 실행할 수 없습니다' })
  }
  const slug = getRouterParam(event,'slug') ?? ''
  const id = getRouterParam(event,'id') ?? ''
  const service = new PhotoAiService(useDb(),config.ai.model,Number(config.ai.dailyRequestLimit))
  try {
    if (action === 'get') return service.get(slug,id)
    if (action !== 'propose') return service[action](slug,id)
    if (!config.ai.apiKey) throw new PhotoAiError(503,'AI API 키가 아직 설정되지 않았습니다')
    if (Number(getHeader(event,'content-length') ?? 0) > 12_000) throw new PhotoAiError(413,'요청이 너무 큽니다')
    let size = 0
    const chunks: Buffer[] = []
    for await (const chunk of event.node.req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > 12_000) throw new PhotoAiError(413,'요청이 너무 큽니다')
      chunks.push(bytes)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    let raw: unknown
    try { raw = JSON.parse(text) as unknown } catch { throw new PhotoAiError(400,'JSON 본문이 필요합니다') }
    return service.start(slug,raw,claudeProvider(config.ai,photosDir()))
  } catch (error) {
    if (error instanceof PhotoAiError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    throw error
  }
}
