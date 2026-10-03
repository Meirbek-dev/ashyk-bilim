import type { AssessmentDetail, AuditEvent, Lifecycle, ReadinessIssue } from '#/shared/api/gen/types.gen'

/** Blockers first, then warnings and advice; the server's order within each. */
export const sortedIssues = (issues: readonly ReadinessIssue[]): ReadinessIssue[] =>
  issues.toSorted((a, b) => Number(a.severity !== 'blocker') - Number(b.severity !== 'blocker'))

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
