import type { AssessmentDetail, AuditEvent, Lifecycle, ReadinessIssue } from '#/shared/api/gen/types.gen'

/** Blockers first, then warnings and advice; the server's order within each. */
export const sortedIssues = (issues: readonly ReadinessIssue[]): ReadinessIssue[] =>
  issues.toSorted((a, b) => Number(a.severity !== 'blocker') - Number(b.severity !== 'blocker'))

export type IssueGroup = { itemId: string | null; codes: ReadinessIssue['code'][] }

/**
 * Readiness by severity (blockers first), each severity's issues gathered per question in the server's order: a
 * question with five problems is one line with one link, not five lines repeating «Мешает публикации».
 */
export function groupedIssues(
  issues: readonly ReadinessIssue[],
): { severity: 'blocker' | 'warning'; groups: IssueGroup[] }[] {
  const sections = new Map<'blocker' | 'warning', Map<string | null, IssueGroup>>()
  for (const issue of sortedIssues(issues)) {
    const severity = issue.severity === 'blocker' ? 'blocker' : 'warning'
    const groups = sections.get(severity) ?? new Map<string | null, IssueGroup>()
    sections.set(severity, groups)
    const group = groups.get(issue.item_id) ?? { itemId: issue.item_id, codes: [] }
    groups.set(issue.item_id, group)
    if (!group.codes.includes(issue.code)) group.codes.push(issue.code)
  }
  return [...sections].map(([severity, groups]) => ({ severity, groups: [...groups.values()] }))
}

const LIFECYCLES = ['draft', 'scheduled', 'published', 'archived'] as const satisfies readonly Lifecycle[]

/** A lifecycle-transition's `from` / `to`, when the payload names a known state. */
export const lifecycleOf = (value: string | undefined): Lifecycle | null =>
  LIFECYCLES.find(known => known === value) ?? null

/** Who did it: you, the scheduler, or someone else (named by `actor_name`). */
export function auditActor(event: AuditEvent, me: string): 'you' | 'system' | 'other' {
  if (event.payload.by === 'scheduler' || event.actor_id === null) return 'system'
  return event.actor_id === me ? 'you' : 'other'
}

/** The transitions the server allows from the current state (`allowed_transitions`); it still answers 409 to others. */
export const canMove = (assessment: Pick<AssessmentDetail, 'allowed_transitions'>, to: Lifecycle): boolean =>
  assessment.allowed_transitions.includes(to)

/**
 * The learner an event is about: a grade names `learner_id`, an exception `user_id`; a submit is the learner's own
 * act (its actor), so it names none.
 */
export function auditLearnerId(event: Pick<AuditEvent, 'payload'>): string | null {
  return event.payload.learner_id ?? event.payload.user_id ?? null
}
