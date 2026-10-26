import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams } from '@tanstack/react-router'
import { Timer } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, SubmissionId } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'

import { clock, showsDueDate, unanswered } from '../model/attempt'
import { submissionOptions } from '../queries'
import { ATTEMPT_PATH, ATTEMPT_ROUTE } from './attempt-frame'

/**
 * «Продолжить» an open draft; on a clock, how long is left, read when the entry opens (B-ATT-27). It reopens at the
 * first question still without an answer (the last one when all are answered), not at the first question again.
 */
export function ContinueDraft({ draftId, items }: { draftId: SubmissionId; items: AssessmentItem[] }) {
  const params = useParams({ from: ATTEMPT_ROUTE })
  const { data: draft } = useSuspenseQuery({ ...submissionOptions(draftId), staleTime: 0 })
  const seconds = draft.time_remaining_seconds
  // Like the runner's clock: a due date days away is no countdown (B-ATT-14).
  const left = seconds !== null && !showsDueDate(draft.time_remaining_reason, seconds) ? seconds : null
  const item = unanswered(items, draft.answers)[0]?.number ?? items.length
  return (
    <div className="flex flex-col items-start gap-4">
      {left === null ? null : (
        <p className="flex items-start gap-2 text-sm">
          <Timer aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {m.attempt_continue_left({ time: clock(left) })}
        </p>
      )}
      <RouterLink
        to={ATTEMPT_PATH}
        params={params}
        search={{ attempt: draftId, ...(item > 1 ? { item } : {}) }}
        className={buttonVariants()}
      >
        {m.attempt_continue()}
      </RouterLink>
    </div>
  )
}
