export type PhotoAiMode = 'organize' | 'enrich'

export interface PhotoAiEnrichment {
  coverPhotoId: number
  body: string
  place: { status: 'unidentified' } | { status: 'candidate'; name: string; evidence: string; photoIds: number[] }
}

/** AI plans never contain deletion or arbitrary coordinates. */
export interface PhotoAiGroup {
  pointId: number | null
  photoIds: number[]
  title: string
  reason: string
  enrichment?: PhotoAiEnrichment
}

export interface PhotoAiRequest {
  mode?: PhotoAiMode
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
  mode?: PhotoAiMode
  id: string
  createdAt: string
  protectedPointIds: number[]
  sendImages: boolean
  usage: PhotoAiUsage
  progress?: { completedBatches: number; totalBatches: number; processedPhotos: number; totalPhotos: number }
}

export type PhotoAiProposal = PhotoAiBase & (
  | { status: 'pending'; groups: []; message: null }
  | { status: 'ready' | 'applied' | 'undone'; groups: PhotoAiGroup[]; message: null }
  | { status: 'failed' | 'cancelled'; groups: []; message: string }
)
