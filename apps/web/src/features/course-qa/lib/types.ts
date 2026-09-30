import type { QaMessage, QaThreadSummary as WireQaThreadSummary } from '@/lib/api/generated/zod'

/** What the panel renders of a v2 `QaMessage` (pending turns are built client-side). */
export type QAMessage = Pick<QaMessage, 'id' | 'role' | 'content' | 'created_at_unix'> & {
  confidence?: string | null | undefined
  /** `{citations: […]}` on assistant turns; the server emits `[]` on user turns (contract defect). */
  citations?: unknown
  metadata?: Record<string, unknown> | undefined
}

export type QAThreadSummary = WireQaThreadSummary
