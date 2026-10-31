import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { vErrorCode } from '#/shared/api/gen/valibot.gen'
import type { StatusTone } from '#/shared/components/status-badge'
import { presentError } from '#/shared/i18n/errors'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import type { ApproveFailure, DraftStatus } from '../model/ai-draft'
import { roundScore } from '../model/scoring'

// The words of AI drafts in the queue and the review (docs/AI-FIRST.md 4.2, 4.3).

const draftStatusMeta = {
  queued: { label: m.grading_ai_status_queued, tone: 'info' },
  ready: { label: m.grading_ai_status_ready, tone: 'info' },
  applied: { label: m.grading_ai_status_applied, tone: 'success' },
  discarded: { label: m.grading_ai_status_discarded, tone: 'neutral' },
  superseded: { label: m.grading_ai_status_superseded, tone: 'neutral' },
  failed: { label: m.grading_ai_status_failed, tone: 'destructive' },
} satisfies Record<DraftStatus, { label: () => string; tone: StatusTone }>

/** A status the server sends; an unknown one shows as itself, quietly. */
export const draftStatus = (status: string): { label: string; tone: StatusTone } => {
  const meta = (draftStatusMeta as Record<string, { label: () => string; tone: StatusTone } | undefined>)[status]
  return meta ? { label: meta.label(), tone: meta.tone } : { label: status, tone: 'neutral' }
}

const flagLabels: Record<string, () => string> = {
  off_topic: m.grading_ai_flag_off_topic,
  possible_plagiarism: m.grading_ai_flag_possible_plagiarism,
  ai_generated_suspected: m.grading_ai_flag_ai_generated,
  incomplete: m.grading_ai_flag_incomplete,
  needs_human: m.grading_ai_flag_needs_human,
  injection_suspected: m.grading_ai_flag_injection,
  unsupported: m.grading_ai_flag_unsupported,
  low_confidence: m.grading_ai_flag_low_confidence,
  no_text: m.grading_ai_flag_no_text,
  draft_mode: m.grading_ai_flag_draft_mode,
}
/** A draft's flag in words; one the web does not know yet shows as sent. */
export const flagText = (flag: string): string => flagLabels[flag]?.() ?? flag

/** Points of a question or criterion on its own scale: «1,5 из 2». */
export const draftPoints = (score: number, max: number): string =>
  m.grading_ai_points({ score: formatNumber(roundScore(score)), max: formatNumber(roundScore(max)) })

/** The model's confidence 0..1 as «Уверенность 85 %». */
export const confidenceText = (confidence: number): string =>
  m.grading_ai_confidence({ percent: formatPercent(confidence * 100) })

const outcomeLabels: Record<string, () => string> = {
  stale: m.grading_ai_outcome_stale,
  not_ready: m.grading_ai_outcome_not_ready,
}

/** Why one draft of a batch approval did not apply: the work changed, not ready, or the save's own error code. */
export function outcomeText(failure: ApproveFailure): string {
  const known = outcomeLabels[failure.result]
  if (known) return known()
  const code = v.safeParse(vErrorCode, failure.error)
  if (!code.success) return m.grading_ai_outcome_failed()
  return presentError(
    new ApiError({ status: 0, code: code.output, fieldErrors: [], requestId: null, retryAfter: null }),
  )
}
