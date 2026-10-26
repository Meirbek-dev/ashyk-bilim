import { Clock, PencilLine, Undo2, type LucideIcon } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type {
  CodeRunStatus,
  Difficulty,
  DisabledReason,
  LanguageInfo,
  SubmissionStatus,
} from '#/shared/api/gen/types.gen'
import type { StatusTone } from '#/shared/components/status-badge'

import { languageOf } from '../model/arena'
import type { CaseVerdict } from '../model/verdict'

/** `icon`: a state that is not a verdict (a draft, waiting for review) gets its own, not the tone's alarm sign. */
type Status = { label: () => string; tone: StatusTone; icon?: LucideIcon }

/** A run's verdict (B-COD-07): the server's enum, never its text. */
export const runStatus = {
  queued: { label: m.code_status_queued, tone: 'neutral' },
  running: { label: m.code_status_running, tone: 'neutral' },
  accepted: { label: m.code_status_accepted, tone: 'success' },
  wrong_answer: { label: m.code_status_wrong_answer, tone: 'destructive' },
  compile_error: { label: m.code_status_compile_error, tone: 'destructive' },
  runtime_error: { label: m.code_status_runtime_error, tone: 'destructive' },
  time_limit: { label: m.code_status_time_limit, tone: 'destructive' },
  internal_error: { label: m.code_status_internal_error, tone: 'warning' },
  degraded: { label: m.code_status_degraded, tone: 'warning' },
} satisfies Record<CodeRunStatus, Status>

const isRunStatus = (status: string): status is CodeRunStatus => Object.hasOwn(runStatus, status)

/** A reference check's `status` (a string in the contract): a run status, or why the language did not run. */
export function referenceStatus(status: string): Status {
  if (status === 'missing_solution') return { label: m.code_check_missing, tone: 'warning' }
  if (status === 'language_not_allowed') return { label: m.code_check_not_allowed, tone: 'warning' }
  return isRunStatus(status) ? runStatus[status] : runStatus.internal_error
}

/** One test's verdict (B-COD-08), from the Judge0 status id. */
export const caseStatus = {
  accepted: runStatus.accepted,
  wrong_answer: runStatus.wrong_answer,
  time_limit: runStatus.time_limit,
  compile_error: runStatus.compile_error,
  runtime_error: runStatus.runtime_error,
  internal_error: runStatus.internal_error,
  pending: runStatus.running,
} satisfies Record<CaseVerdict, Status>

export const attemptStatus = {
  draft: { label: m.code_attempt_draft, tone: 'warning', icon: PencilLine },
  pending: { label: m.code_attempt_pending, tone: 'info', icon: Clock },
  graded: { label: m.code_attempt_graded, tone: 'info', icon: Clock },
  published: { label: m.code_attempt_published, tone: 'success' },
  returned: { label: m.code_attempt_returned, tone: 'warning', icon: Undo2 },
} satisfies Record<SubmissionStatus, Status>

export const reasonLabels = {
  NOT_PUBLISHED: m.code_reason_not_published,
  SCHEDULED_NOT_OPEN: m.code_reason_not_open,
  ARCHIVED: m.code_reason_archived,
  COURSE_ARCHIVED: m.code_reason_archived,
  PAST_DUE: m.code_reason_past_due,
  MAX_ATTEMPTS_REACHED: m.code_reason_max_attempts,
  TIME_LIMIT_EXPIRED: m.code_reason_time_expired,
  REMEDIATION_REQUIRED: m.code_reason_remediation,
  ACCESS_RESTRICTED: m.code_reason_restricted,
  NOT_ENROLLED: m.code_reason_not_enrolled,
} satisfies Record<DisabledReason, () => string>

export const difficultyLabels = {
  easy: m.code_difficulty_easy,
  medium: m.code_difficulty_medium,
  hard: m.code_difficulty_hard,
} satisfies Record<Difficulty, () => string>

/**
 * A language's name from the platform. Without the list (the runner is down) the name is unknown, not the language
 * unavailable: «Язык № 71»; «Недоступный язык» only for one the platform no longer offers.
 */
export const languageName = (languages: LanguageInfo[] | null, id: number) =>
  languageOf(languages, id)?.name ?? (languages ? m.code_language_unknown({ id }) : m.code_language_number({ id }))
