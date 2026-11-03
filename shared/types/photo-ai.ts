/** AI plans never contain deletion or arbitrary coordinates. */
export interface PhotoAiGroup {
  pointId: number | null
  photoIds: number[]
  title: string
  reason: string
}

export interface PhotoAiRequest {
  requestId: string
  context: string
  sendImages: boolean
  /** Omitted on the wire means protect every current point. */
  protectedPointIds: number[]
}

export interface PhotoAiUsage {
  inputTokens: number
  outputTokens: number
  attempts: number
}

interface PhotoAiBase {
  id: string
  createdAt: string
  protectedPointIds: number[]
  sendImages: boolean
  usage: PhotoAiUsage
}

export type PhotoAiProposal = PhotoAiBase & (
  | { status: 'pending'; groups: []; message: null }
  | { status: 'ready' | 'applied' | 'undone'; groups: PhotoAiGroup[]; message: null }
  | { status: 'failed' | 'cancelled'; groups: []; message: string }
)
