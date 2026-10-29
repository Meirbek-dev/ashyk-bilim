import { m } from '#/paraglide/messages'
import type { Attempt } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'

import { GradeDetails } from './grade-details'

/** Returned: what happened, what to do, then the teacher's words (the files below stay editable). */
export function ReturnedNotice({ attempt, revisable }: { attempt: Attempt; revisable: boolean }) {
  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <StatusBadge tone="warning">{m.submission_returned()}</StatusBadge>
        {/* "Revise and hand in again" only while it can be handed in: past a closed deadline the reason says so. */}
        {revisable ? <p className="text-sm text-muted-foreground">{m.submission_returned_hint()}</p> : null}
      </div>
      <GradeDetails attempt={attempt} />
    </>
  )
}
