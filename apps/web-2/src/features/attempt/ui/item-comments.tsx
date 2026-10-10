import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentItem, SubmissionId } from '#/shared/api/gen/types.gen'

import { feedbackOptions } from '../queries'

type ItemCommentsProps = { submissionId: SubmissionId; items: AssessmentItem[]; shown: readonly string[] }

/**
 * The teacher's released comments on this attempt (`GET /submissions/{id}/feedback`) that the breakdown does not show
 * already, each under its question number; nothing when there are none.
 */
export function ItemComments({ submissionId, items, shown }: ItemCommentsProps) {
  const { data: comments } = useSuspenseQuery(feedbackOptions(submissionId))
  const written = comments.filter(comment => comment.comment.trim() && !shown.includes(comment.item_id ?? ''))
  const number = (itemId: string | null) => items.findIndex(item => item.id === itemId) + 1
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
            {number(comment.item_id) ? `${m.attempt_question_number({ number: number(comment.item_id) })}: ` : ''}
            {comment.comment}
          </li>
        ))}
      </ul>
    </section>
  )
}
