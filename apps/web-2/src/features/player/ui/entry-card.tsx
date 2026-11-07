import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { ActivityState, CourseId, WorkState } from '#/shared/api/gen/types.gen'

import { activityKind, type ActivityKind } from '../model/player'
import { AskTeacherNote } from './ask-teacher-note'
import { EntryFigures } from './entry-figures'

// What the work is like, for a learner who has not handed anything in yet.
const hints = {
  attempt: m.player_hint_attempt,
  code: m.player_hint_code,
  submission: m.player_hint_submission,
} satisfies Record<Exclude<ActivityKind, 'lesson'>, () => string>

const fresh = new Set<WorkState>(['not_started', 'in_progress'])
const open = new Set<WorkState>(['not_started', 'in_progress', 'returned'])

/**
 * Graded work's entry (B-PLY-11): the work state, the released grade large, the deadline, a line on how the work goes
 * before anything is handed in; the action sits below it.
 */
export function EntryCard({
  courseId,
  entry,
  action,
  nowUnix,
  archived = false,
}: {
  courseId: CourseId
  entry: ActivityState
  action: ReactNode
  /** When the learner state was read: the clock the hours left are counted from. */
  nowUnix: number
  /** An archived course (the note above says so): no hours left, no how-to, no retake to ask for. */
  archived?: boolean
}) {
  const kind = activityKind(entry.activity_type)
  // Failed with no attempt left (B-PLY-19): the learner is not left at a dead end that «Продолжить» keeps leading to.
  // Due within 48 h and not handed in (B-PLY-21): the hours left in the warning tone, as /home says it.
  const left = entry.due_at_unix === null ? 0 : entry.due_at_unix - nowUnix
  const soon =
    !archived && open.has(entry.state) && left > 0 && left <= 48 * 3600 ? Math.max(1, Math.ceil(left / 3600)) : null
  // A retake behind the teacher's remediation (`remediate`) is not out of attempts: the card leads to it.
  const remediate = entry.allowed_actions.includes('remediate')
  const outOfAttempts = !archived && entry.state === 'failed' && !entry.allowed_actions.includes('start') && !remediate
  // No retake past the due date with attempts left too: the card names that reason, not «no attempts left».
  const pastDue = entry.due_at_unix !== null && entry.due_at_unix <= nowUnix
  // Not handed in by the last hand-in moment (no late window, or past its cutoff; returned work too): the server
  // offers no start, continue or revise, and the card says why instead of leading to a page that would only refuse.
  const closed =
    !archived &&
    kind !== 'lesson' &&
    open.has(entry.state) &&
    pastDue &&
    !entry.allowed_actions.some(allowed => allowed === 'start' || allowed === 'continue' || allowed === 'revise')
  const late = entry.is_late || (!archived && open.has(entry.state) && pastDue)
  return (
    <div className="flex flex-col items-start gap-5">
      <EntryFigures
        entry={entry}
        late={late}
        soon={soon}
        retake={fresh.has(entry.state) || entry.state === 'returned'}
      />
      {/* A test's line promises the conditions page, which an attempt in progress has already passed (a timed one
          keeps running: no «stop and continue later»). */}
      {!archived &&
      !closed &&
      kind !== 'lesson' &&
      (kind === 'attempt' ? entry.state === 'not_started' : fresh.has(entry.state)) &&
      entry.score === null ? (
        <p className="max-w-prose font-reading text-muted-foreground">{hints[kind]()}</p>
      ) : null}
      {remediate ? <p className="max-w-prose text-sm text-muted-foreground">{m.player_remediation_hint()}</p> : null}
      {closed ? <AskTeacherNote courseId={courseId}>{m.player_past_due_closed()}</AskTeacherNote> : null}
      {outOfAttempts ? (
        <AskTeacherNote courseId={courseId}>
          {pastDue ? m.player_past_due_retake() : m.player_out_of_attempts()}
        </AskTeacherNote>
      ) : null}
      {action}
    </div>
  )
}
