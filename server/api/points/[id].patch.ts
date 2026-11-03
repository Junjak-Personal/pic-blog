import { editPoint } from '../../utils/point-edit'

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: '잘못된 포인트 id' })
  const raw: unknown = await readBody(event)
  if (typeof raw !== 'object' || raw === null) throw createError({ statusCode: 400, statusMessage: '본문이 비어 있습니다' })
  return editPoint(useDb(), id, raw as Record<string, unknown>)
})
