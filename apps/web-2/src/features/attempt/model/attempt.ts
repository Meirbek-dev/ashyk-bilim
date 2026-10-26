import { ApiError } from '#/shared/api/errors'
import type {
  AssessmentItem,
  AttemptState,
  AutoSubmitReason,
  DisabledReason,
  ErrorCode,
  GradedItem,
  ItemAnswer,
  ItemBody,
  Policy,
  StudentSubmission,
} from '#/shared/api/gen/types.gen'

export type EntryAction =
  | { kind: 'continue'; draftId: string }
  | { kind: 'start'; revision: boolean }
  | { kind: 'blocked'; reasons: DisabledReason[] }

/** The entry's one action, from the server's attempt state only. */
export function entryAction(state: AttemptState): EntryAction {
  if (state.can_continue && state.draft_id) return { kind: 'continue', draftId: state.draft_id }
  if (state.can_start) return { kind: 'start', revision: state.revision_requested }
  return { kind: 'blocked', reasons: state.disabled_reasons }
}

export const needsRemediation = (state: AttemptState) => state.disabled_reasons.includes('REMEDIATION_REQUIRED')

/**
 * A retake is the teacher's call, not a dead end (B-ATT-03, as the player's card B-PLY-19): after the last attempt, or
 * after the due date once one was handed in.
 */
export const asksTeacherForRetake = (state: AttemptState) =>
  state.disabled_reasons.includes('MAX_ATTEMPTS_REACHED') ||
  (state.disabled_reasons.includes('PAST_DUE') && state.attempts_used > 0)

/**
 * The automatically scored part of an attempt still under manual review (B-ATT-25): shown when the policy lets the
 * learner see scores at all; null once the grade is out or when nothing was auto-scored.
 */
export function autoPart(
  attempt: Pick<StudentSubmission, 'auto_score' | 'final_score' | 'status'>,
  visibility: Policy['review_visibility'],
): number | null {
  if (attempt.status !== 'pending' || attempt.final_score !== null || visibility === 'none') return null
  return attempt.auto_score
}

/**
 * "Passed / not passed" of a handed-in attempt (B-ATT-23): only for a released score, against the effective passing
 * score; null while there is nothing to judge (on review, held back, returned for revision).
 */
export function resultVerdict(
  attempt: Pick<StudentSubmission, 'final_score' | 'release_state'>,
  state: Pick<AttemptState, 'effective'>,
): 'passed' | 'not_passed' | null {
  if (attempt.release_state !== 'visible' || attempt.final_score === null) return null
  return attempt.final_score >= state.effective.passing_score ? 'passed' : 'not_passed'
}

/** The exam protections the client applies (devtools detection is not one: a window-size guess, not a measure). */
export type Protection = 'tab_switch' | 'copy_paste' | 'right_click' | 'fullscreen'
type Guards = Pick<
  Policy,
  'tab_switch_detection' | 'copy_paste_protection' | 'right_click_disabled' | 'fullscreen_required'
>
export function protections(policy: Guards): Protection[] {
  const on: [boolean, Protection][] = [
    [policy.tab_switch_detection, 'tab_switch'],
    [policy.copy_paste_protection, 'copy_paste'],
    [policy.right_click_disabled, 'right_click'],
    [policy.fullscreen_required, 'fullscreen'],
  ]
  return on.filter(([enabled]) => enabled).map(([, protection]) => protection)
}

/**
 * An answer that is not complete yet: the question counts as unanswered. With the question's body, a matching
 * question needs a pair for every left element and a form every required field (two of three pairs used to count as
 * answered, and the hand-in said «every question has an answer»).
 */
export function isBlank(answer: ItemAnswer | undefined, body?: ItemBody): boolean {
  if (!answer) return true
  if (answer.kind === 'choice') return !answer.selected?.length
  if (answer.kind === 'open_text') return !answer.text?.trim()
  if (answer.kind === 'form') {
    const values = answer.values ?? {}
    const required = body?.kind === 'form' ? (body.fields ?? []).filter(field => field.required) : []
    if (required.some(field => !values[field.id]?.trim())) return true
    return !Object.values(values).some(value => value.trim())
  }
  if (answer.kind === 'code') return !answer.source?.trim()
  const lefts = body?.kind === 'matching' && 'left' in body ? body.left.length : 1
  return (answer.matches?.length ?? 0) < Math.max(lefts, 1)
}

/** A graded question's verdict where the policy shows one; a question left empty is «not answered», not «wrong». */
export type Verdict = 'correct' | 'partly' | 'wrong' | 'skipped'
export const verdict = (entry: Pick<GradedItem, 'correct' | 'score'>, answered: boolean): Verdict | null => {
  if (entry.correct === null) return null
  if (entry.correct) return 'correct'
  if (!answered) return 'skipped'
  return entry.score > 0 ? 'partly' : 'wrong'
}

/** Questions without a complete answer, with their 1-based number in the order shown. */
/**
 * The prompt worth showing under the item's title, or null. Most migrated questions repeat the title as the prompt
 * (shown twice otherwise); others keep the wording only in the prompt (title «Вопрос.», «сұрақ:»).
 */
export const extraPrompt = (item: AssessmentItem): string | null => {
  const prompt = item.body.prompt ?? ''
  return prompt.trim() && prompt.trim() !== item.title.trim() ? prompt : null
}

export const unanswered = (items: AssessmentItem[], answers: Record<string, ItemAnswer>) =>
  items.map((item, index) => ({ item, number: index + 1 })).filter(({ item }) => isBlank(answers[item.id], item.body))

/** Seconds left on the server's clock: `time_remaining_seconds` was true when the answer arrived. */
export const secondsLeft = (remaining: number, receivedAtMs: number, nowMs: number) =>
  Math.max(0, Math.ceil(remaining - (nowMs - receivedAtMs) / 1000))

/** When the server's clock reaches zero (unix seconds, to the minute: due dates are set to the minute). */
export const clockEndsAt = (remaining: number, receivedAtMs: number) =>
  Math.round((receivedAtMs / 1000 + remaining) / 60) * 60

/** The clock runs to a due date or late cutoff (the server says which), not the time limit. */
export const runsToDueDate = (reason: AutoSubmitReason | null) => reason !== null && reason !== 'time_expired'

/** A countdown face: "mm:ss", or "h:mm:ss" from an hour up (or when `hours` asks: the part after whole days). */
const two = (value: number) => String(value).padStart(2, '0')
export function clock(seconds: number, hours = seconds >= 3600): string {
  const h = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = two(seconds % 60)
  return hours ? `${h}:${two(minutes)}:${rest}` : `${two(minutes)}:${rest}`
}

/** A day: a countdown to a due date can be weeks long, its face counts whole days first. */
export const DAY_SECONDS = 86_400

/**
 * A due-date clock reads «Сдать до <date>» until its last day; the late cutoff counts down as soon as the due date has
 * passed (the late window is running out).
 */
export const showsDueDate = (reason: AutoSubmitReason | null, seconds: number) =>
  runsToDueDate(reason) && reason !== 'late_cutoff_passed' && seconds > DAY_SECONDS

/** The last five minutes are a warning. */
export const WARN_SECONDS = 300

/**
 * What a failed draft save means. `conflict`: another tab or device saved (409); `throttled`: the 5 s window (429);
 * `closed`: the server's gate shut saving (403: time, due date, remediation); `gone`: no such draft (404);
 * `network`: no answer or a 5xx, so try again; `failed`: anything else.
 */
export type SaveOutcome = 'conflict' | 'throttled' | 'closed' | 'gone' | 'network' | 'failed'
export function saveOutcome(error: unknown): SaveOutcome {
  if (!(error instanceof ApiError) || error.status >= 500) return 'network'
  // An archived course answers 409 too, but nothing saves any more: not a draft saved elsewhere.
  if (error.status === 409) return error.code === 'course-archived' ? 'closed' : 'conflict'
  if (error.status === 429) return 'throttled'
  if (error.status === 403) return 'closed'
  if (error.status === 404) return 'gone'
  return 'failed'
}

const GATE_CODES: readonly ErrorCode[] = [
  'attempt-time-expired',
  'attempt-past-due',
  'remediation-required',
  'course-archived',
]

/**
 * Why the gate shut, when the refusal names it (a 403 `attempt-time-expired`..., the 409 `course-archived`); a plain
 * `forbidden` names nothing.
 */
export const gateCode = (error: unknown): ErrorCode | null =>
  error instanceof ApiError && GATE_CODES.includes(error.code) ? error.code : null

/** A 404 on the attempt itself: the test was unpublished or archived under it, so nothing saves or hands in any more. */
export const attemptGone = (error: unknown) => error instanceof ApiError && error.status === 404

/** The one save indicator has exactly three states (B-ATT-09): no network wins, then anything still queued. */
export type SaveStatus = 'saved' | 'saving' | 'offline'
export const saveStatus = (online: boolean, problem: SaveOutcome | null, queued: number): SaveStatus =>
  !online || problem === 'network' ? 'offline' : queued ? 'saving' : 'saved'

/** The server allows one draft save per 5 s; a client never sends faster (plus slack for the trip). */
export const SAVE_WINDOW_MS = 5500

/** When to send again after a failure: `Retry-After` on a 429, else the save window. */
export const retryDelayMs = (error: unknown): number =>
  error instanceof ApiError && error.status === 429 && error.retryAfter ? error.retryAfter * 1000 : SAVE_WINDOW_MS

/**
 * What a failed submit means. `network`: no answer, so the same `Idempotency-Key` retries (the server replays);
 * `reread`: a 409 (submitted elsewhere, or the test changed under the draft: the attempt decides which); `closed`:
 * the gate shut (403); `failed`: anything else.
 */
export type SubmitOutcome = 'network' | 'reread' | 'closed' | 'failed'
export function submitOutcome(error: unknown): SubmitOutcome {
  if (!(error instanceof ApiError) || error.status >= 500) return 'network'
  if (error.status === 409) return error.code === 'course-archived' ? 'closed' : 'reread'
  if (error.status === 403) return 'closed'
  return 'failed'
}
