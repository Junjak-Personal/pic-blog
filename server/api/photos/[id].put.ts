/**
 * 사진 바이트 업로드 — display / thumb 두 파일 + display 픽셀 크기(w/h).
 * 서버는 바이트를 그대로 디스크에 쓴다 (제약 #1). 디코딩하지 않으므로 크기는
 * 리사이즈한 클라이언트만 안다 — 매니페스트가 아니라 여기서 받는다.
 * 사진 단위라서 부분 실패를 그대로 UI 에 보여주고 재시도할 수 있다 (설계문서 §8).
 */
const MAX_BYTES = 12 * 1024 * 1024

/** 픽셀 크기도 신뢰 경계다 — 폼 필드라 문자열로 온다. */
function dim(raw: string | undefined, field: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0 || n > 20000) {
    throw createError({ statusCode: 400, statusMessage: `${field}: 픽셀 크기가 잘못됐습니다` })
  }
  return n
}

export default defineEventHandler(async (event) => {
  await requireEditor(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: '잘못된 사진 id' })
  }

  const db = useDb()
  const row = db
    .prepare<[number], { display_path: string; thumb_path: string }>(
      `SELECT display_path, thumb_path FROM photo WHERE id = ?`,
    )
    .get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: '사진을 찾을 수 없습니다' })

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: '파일이 없습니다' })

  const display = parts.find((p) => p.name === 'display')
  const thumb = parts.find((p) => p.name === 'thumb')
  if (!display?.data || !thumb?.data) {
    throw createError({ statusCode: 400, statusMessage: 'display 와 thumb 이 모두 필요합니다' })
  }
  if (display.data.length > MAX_BYTES || thumb.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: '파일이 너무 큽니다' })
  }

  const w = dim(parts.find((p) => p.name === 'w')?.data.toString(), 'w')
  const h = dim(parts.find((p) => p.name === 'h')?.data.toString(), 'h')

  writePhotoBytes(row.display_path, display.data)
  writePhotoBytes(row.thumb_path, thumb.data)
  // 바이트가 디스크에 안착한 뒤에 크기를 채운다 — w>0 이 「이 사진은 실물이 있다」는 표시다
  db.prepare<[number, number, number]>(`UPDATE photo SET w = ?, h = ? WHERE id = ?`).run(w, h, id)

  return { ok: true, id, bytes: display.data.length + thumb.data.length }
})
