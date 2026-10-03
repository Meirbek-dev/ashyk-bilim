import { m } from '#/paraglide/messages'
import type { FileAttemptStatus, ItemKind, MessageParams, SubmissionStatus } from '#/shared/api/gen/types.gen'
import type { StatusTone } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import type { QueueStatus } from '../model/search'
import { roundScore } from '../model/scoring'

/** Both status enums; a file attempt's `submitted` reads as an assessment's `pending` (ungraded vs released). */
export const statusMeta = {
  draft: { label: m.grading_status_draft, tone: 'neutral' },
  pending: { label: m.grading_status_pending, tone: 'warning' },
  submitted: { label: m.grading_status_pending, tone: 'warning' },
  graded: { label: m.grading_status_graded, tone: 'info' },
  published: { label: m.grading_status_published, tone: 'success' },
  returned: { label: m.grading_status_returned, tone: 'neutral' },
} satisfies Record<SubmissionStatus | FileAttemptStatus, { label: () => string; tone: StatusTone }>

export const filterLabels = {
  needs_grading: m.grading_filter_needs_grading,
  graded: m.grading_filter_graded,
  published: m.grading_filter_published,
  returned: m.grading_filter_returned,
} satisfies Record<QueueStatus, () => string>

export const kindLabels = {
  choice: m.grading_kind_choice,
  open_text: m.grading_kind_open_text,
  form: m.grading_kind_form,
  code: m.grading_kind_code,
  matching: m.grading_kind_matching,
} satisfies Record<ItemKind, () => string>

/** A 0..100 score at hundredths (99.99 never shows as 100), or "no grade" while there is none (BUG-202). */
export const scoreText = (score: number | null): string =>
  score === null ? m.grading_no_score() : m.grading_percent({ value: formatNumber(roundScore(score)) })

type Counts = { correct: string; total: string }
const verdicts: Record<string, (counts: Counts) => string> = {
  'no-answer': () => m.grading_verdict_no_answer(),
  'no-correct-answer': () => m.grading_verdict_no_correct(),
  correct: () => m.grading_verdict_correct(),
  incorrect: () => m.grading_verdict_incorrect(),
  'partially-correct-no-credit': () => m.grading_verdict_partial_no_credit(),
  'partially-correct': counts => m.grading_verdict_partial(counts),
  'pairs-matched': counts => m.grading_verdict_pairs(counts),
  'tests-passed': counts => m.grading_verdict_tests(counts),
}

/**
 * The auto-grader's verdict from `feedback_code` + `feedback_params` in the interface language; an unknown code
 * falls back to the server's English `feedback`, teacher prose (no code) is not a verdict.
 */
export function verdictText(item: { feedback_code?: string; feedback_params?: MessageParams; feedback?: string }) {
  if (!item.feedback_code) return null
  const params = item.feedback_params ?? {}
  const counts = { correct: String(params['correct'] ?? ''), total: String(params['total'] ?? '') }
  return verdicts[item.feedback_code]?.(counts) ?? item.feedback ?? null
}
