import { editPost } from '../../utils/post-edit'

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'slug 가 없습니다' })
  const raw: unknown = await readBody(event)
  if (typeof raw !== 'object' || raw === null) throw createError({ statusCode: 400, statusMessage: '본문이 비어 있습니다' })
  return editPost(useDb(), slug, raw as Record<string, unknown>)
})
