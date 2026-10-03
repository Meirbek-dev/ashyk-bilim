import { ApiError } from '#/shared/api/errors'
import type { AssessmentItem, AttemptState, DisabledReason, ItemAnswer, Policy } from '#/shared/api/gen/types.gen'

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

/** An answer that says nothing yet: the question counts as unanswered. */
export function isBlank(answer: ItemAnswer | undefined): boolean {
  if (!answer) return true
  if (answer.kind === 'choice') return !answer.selected?.length
  if (answer.kind === 'open_text') return !answer.text?.trim()
  if (answer.kind === 'form') return !Object.values(answer.values ?? {}).some(value => value.trim())
  if (answer.kind === 'code') return !answer.source?.trim()
  return !answer.matches?.length
}

/** Questions without an answer, with their 1-based number in the order shown. */
export const unanswered = (items: AssessmentItem[], answers: Record<string, ItemAnswer>) =>
  items.map((item, index) => ({ item, number: index + 1 })).filter(({ item }) => isBlank(answers[item.id]))

/** Seconds left on the server's clock: `time_remaining_seconds` was true when the answer arrived. */
export const secondsLeft = (remaining: number, receivedAtMs: number, nowMs: number) =>
  Math.max(0, Math.ceil(remaining - (nowMs - receivedAtMs) / 1000))

/** A countdown face: "mm:ss", or "h:mm:ss" from an hour up. */
const two = (value: number) => String(value).padStart(2, '0')
export function clock(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = two(seconds % 60)
  return hours ? `${hours}:${two(minutes)}:${rest}` : `${two(minutes)}:${rest}`
}

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
  if (error.status === 409) return 'conflict'
  if (error.status === 429) return 'throttled'
  if (error.status === 403) return 'closed'
  if (error.status === 404) return 'gone'
  return 'failed'
}

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
  if (error.status === 409) return 'reread'
  if (error.status === 403) return 'closed'
  return 'failed'
}
