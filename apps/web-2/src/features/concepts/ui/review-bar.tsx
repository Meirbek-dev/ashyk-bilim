import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ConceptId, CourseId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { formatNumber } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { reviewOptions } from '../queries'

type ReviewBarProps = { courseId: CourseId; selected: ReadonlySet<ConceptId>; onDone: () => void }

/** «Approve» / «Reject» for the selected concepts in one request (B-CON-04); the answer is the new graph. */
export function ReviewBar({ courseId, selected, onDone }: ReviewBarProps) {
  const review = useMutation(reviewOptions(useQueryClient(), courseId))
  if (selected.size === 0) return null
  const decide = (status: 'approved' | 'rejected') =>
    review.mutate(
      { path: { course_id: courseId }, body: { status, concept_ids: [...selected] } },
      {
        onSuccess: () => {
          toast.add({ title: status === 'approved' ? m.concepts_approved_done() : m.concepts_rejected_done() })
          onDone()
        },
      },
    )
  const deciding = review.isPending ? review.variables.body.status : null
  return (
    // Sticky under the top bar (h-14): a long list scrolls while picking, the decision stays in reach.
    <div className="sticky top-14 z-10 flex flex-col gap-2 bg-background py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm tabular-nums">{m.concepts_selected({ count: formatNumber(selected.size) })}</p>
        <SubmitButton variant="outline" pending={deciding === 'approved'} onClick={() => decide('approved')}>
          {m.concepts_approve()}
        </SubmitButton>
        <SubmitButton variant="outline" pending={deciding === 'rejected'} onClick={() => decide('rejected')}>
          {m.concepts_reject()}
        </SubmitButton>
      </div>
      {review.error ? <ErrorAlert>{presentError(review.error)}</ErrorAlert> : null}
    </div>
  )
}
