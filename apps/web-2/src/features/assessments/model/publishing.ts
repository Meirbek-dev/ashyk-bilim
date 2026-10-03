import type { AuditEvent, Lifecycle, ReadinessIssue } from '#/shared/api/gen/types.gen'

// Readiness codes and audit events are strings in the contract (SPEC "Ждёт сервера"): these lists are the server's
// (`build_readiness`, `ItemBody::readiness`, `insert_audit_event`). An unknown one reads as null: still listed, with a
// generic text.

const ISSUE_CODES = [
  'assessment.title_missing',
  'assessment.empty',
  'schedule.after_due_at',
  'policy.due_at_past',
  'policy.cutoff_before_due',
  'policy.penalty_without_late',
  'item.kind_forbidden',
  'item.title_missing',
  'item.max_score_invalid',
  'choice.prompt_missing',
  'choice.options_missing',
  'choice.option_text_missing',
  'choice.option_duplicate',
  'choice.option_id_duplicate',
  'choice.correct_missing',
  'choice.too_many_correct',
  'open_text.prompt_missing',
  'open_text.min_words_invalid',
  'form.prompt_missing',
  'form.fields_missing',
  'form.field_label_missing',
  'form.field_id_duplicate',
  'code.prompt_missing',
  'code.languages_missing',
  'code.tests_missing',
  'code.test_io_missing',
  'code.test_weight_invalid',
  'matching.prompt_missing',
  'matching.pairs_missing',
  'matching.pair_value_missing',
  'matching.left_duplicate',
  'matching.right_duplicate',
] as const
export type IssueCode = (typeof ISSUE_CODES)[number]

export const issueCode = (code: string): IssueCode | null => ISSUE_CODES.find(known => known === code) ?? null

/** Blockers first, then warnings and advice; the server's order within each. */
export const sortedIssues = (issues: readonly ReadinessIssue[]): ReadinessIssue[] =>
  issues.toSorted((a, b) => Number(a.severity !== 'blocker') - Number(b.severity !== 'blocker'))

const AUDIT_EVENTS = [
  'lifecycle-transition',
  'auto-publish-skipped',
  'access-changed',
  'override-created',
  'override-updated',
  'override-deleted',
  'duplicated-from',
  'deadline-extension-requested',
  'deadline-extended',
  'submission-submitted',
  'grade-saved',
  'grades-published',
] as const
export type AuditEventName = (typeof AUDIT_EVENTS)[number]

export const auditEvent = (event: string): AuditEventName | null => AUDIT_EVENTS.find(known => known === event) ?? null

const LIFECYCLES = ['draft', 'scheduled', 'published', 'archived'] as const satisfies readonly Lifecycle[]

/** A lifecycle-transition's `from` / `to`, when the payload names a known state. */
export const lifecycleOf = (value: string | undefined): Lifecycle | null =>
  LIFECYCLES.find(known => known === value) ?? null

/** Who did it: you, the scheduler, or someone else (the event carries only an id). */
export function auditActor(event: AuditEvent, me: string): 'you' | 'system' | 'other' {
  if (event.payload.by === 'scheduler' || event.actor_id === null) return 'system'
  return event.actor_id === me ? 'you' : 'other'
}

/**
 * The server's transition table (`lifecycle` doc): draft -> scheduled/published/archived,
 * scheduled -> draft/published/archived, published -> draft/archived, archived -> draft. The contract has no list
 * of allowed transitions, so the buttons follow this one; the server still answers 409 to anything else.
 */
const TRANSITIONS: Record<Lifecycle, readonly Lifecycle[]> = {
  draft: ['scheduled', 'published', 'archived'],
  scheduled: ['draft', 'published', 'archived'],
  published: ['draft', 'archived'],
  archived: ['draft'],
}

export const canMove = (from: Lifecycle, to: Lifecycle): boolean => TRANSITIONS[from].includes(to)
