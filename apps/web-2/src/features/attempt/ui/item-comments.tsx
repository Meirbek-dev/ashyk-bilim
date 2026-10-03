import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { SubmissionId } from '#/shared/api/gen/types.gen'

import { feedbackOptions } from '../queries'

/** The teacher's released comments on this attempt (`GET /submissions/{id}/feedback`); nothing when there are none. */
export function ItemComments({ submissionId }: { submissionId: SubmissionId }) {
  const { data: comments } = useSuspenseQuery(feedbackOptions(submissionId))
  const written = comments.filter(comment => comment.comment.trim())
  if (!written.length) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{m.attempt_feedback_heading()}</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {written.map(comment => (
          <li
            key={`${comment.item_id ?? 'all'}-${comment.created_at_unix}`}
            className="wrap-anywhere whitespace-pre-line"
          >
            {comment.comment}
          </li>
        ))}
      </ul>
    </section>
  )
}
