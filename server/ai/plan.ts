import { createHash } from 'node:crypto'
import type { PhotoRow, PointRow, PostRow } from '../../shared/types/db'
import type { PhotoAiGroup, PhotoAiRequest } from '../../shared/types/photo-ai'

export interface PhotoSnapshot {
  post: PostRow
  points: PointRow[]
  photos: PhotoRow[]
}

export class PhotoAiError extends Error {
  constructor(public statusCode: number, message: string) { super(message) }
}

export function fail(status: number, message: string): never { throw new PhotoAiError(status, message) }

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '객체 형식이 필요합니다')
  return value as Record<string, unknown>
}

function ids(value: unknown): number[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0)) {
    fail(400, '사진과 포인트 ID는 양의 정수 배열이어야 합니다')
  }
  return value as number[]
}

export function parseRequest(raw: unknown, snapshot: PhotoSnapshot): PhotoAiRequest {
  const value = object(raw)
  if (typeof value.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)) {
    fail(400, '요청 ID가 올바르지 않습니다')
  }
  if (typeof value.context !== 'string' || value.context.length > 1000) fail(400, '맥락은 1,000자 이내여야 합니다')
  if (typeof value.sendImages !== 'boolean') fail(400, '사진 전송 여부를 선택해 주세요')
  const protectedPointIds = value.protectedPointIds === undefined ? snapshot.points.map(p => p.id) : ids(value.protectedPointIds)
  if (protectedPointIds.some(id => !snapshot.points.some(p => p.id === id))) fail(400, '다른 기록의 포인트는 사용할 수 없습니다')
  return { requestId: value.requestId, context: value.context.trim(), sendImages: value.sendImages, protectedPointIds: [...new Set(protectedPointIds)].sort((a,b) => a-b) }
}

export function snapshotHash(snapshot: PhotoSnapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

export function hasManualContent(point: PointRow) {
  return Boolean(point.title?.trim() || point.body?.trim() || point.tags !== '[]' || point.links !== '[]' || point.expenses !== '[]')
}

export function trustedPosition(photo: Pick<PhotoRow, 'lat' | 'lng'>) {
  return Number.isFinite(photo.lat) && Number.isFinite(photo.lng) && Math.abs(photo.lat) <= 90 && Math.abs(photo.lng) <= 180 && !(photo.lat === 0 && photo.lng === 0)
}

/** Unknown positions stay in their existing groups; no invented GPS or place name. */
export function protectedIds(snapshot: PhotoSnapshot, requested: number[]) {
  const locked = new Set(requested)
  for (const p of snapshot.points) {
    if (hasManualContent(p) || snapshot.photos.some(ph => ph.point_id === p.id && !trustedPosition(ph))) locked.add(p.id)
  }
  return [...locked].sort((a,b) => a-b)
}

export function fixedGroups(snapshot: PhotoSnapshot, protectedPointIds: number[]): PhotoAiGroup[] {
  return snapshot.points.filter(p => protectedPointIds.includes(p.id)).map(p => ({
    pointId: p.id, photoIds: snapshot.photos.filter(ph => ph.point_id === p.id).sort((a,b) => a.order_index-b.order_index || a.id-b.id).map(ph => ph.id),
    title: p.title ?? '', reason: '기존 그룹과 수동 기록을 유지합니다',
  }))
}

/** The external result is untrusted. Neither IDs outside this post nor partial partitions survive. */
export function validateGroups(raw: unknown, snapshot: PhotoSnapshot, lockedIds: number[]): PhotoAiGroup[] {
  const value = object(raw)
  if (!Array.isArray(value.groups) || value.groups.length > 40) fail(422, 'AI 결과의 그룹 형식이 올바르지 않습니다')
  const editable = snapshot.photos.filter(ph => !lockedIds.includes(ph.point_id))
  const seen = new Set<number>()
  const seenPoints = new Set<number>()
  const groups = value.groups.map(entry => {
    const group = object(entry)
    const pointId = group.pointId
    if (pointId !== null && (typeof pointId !== 'number' || !snapshot.points.some(p => p.id === pointId) || lockedIds.includes(pointId))) {
      fail(422, 'AI가 수정할 수 없는 포인트를 선택했습니다')
    }
    if (pointId !== null && seenPoints.has(pointId)) fail(422, 'AI 결과에 포인트가 중복되었습니다')
    if (pointId !== null) seenPoints.add(pointId)
    const photoIds = ids(group.photoIds)
    if (!photoIds.length) fail(422, 'AI 결과에 빈 그룹이 있습니다')
    for (const id of photoIds) {
      if (seen.has(id) || !editable.some(ph => ph.id === id)) fail(422, 'AI 결과의 사진 소속 또는 중복을 확인해 주세요')
      seen.add(id)
    }
    if (typeof group.title !== 'string' || !group.title.trim() || group.title.length > 200) fail(422, 'AI 제목은 1~200자여야 합니다')
    if (typeof group.reason !== 'string' || group.reason.length > 500) fail(422, 'AI 설명이 올바르지 않습니다')
    return { pointId, photoIds, title: group.title.trim(), reason: group.reason.trim() }
  })
  if (seen.size !== editable.length) fail(422, 'AI 결과에서 사진이 누락되었습니다')
  return [...fixedGroups(snapshot, lockedIds), ...groups]
}
