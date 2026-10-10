import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { StudentSubmission } from '#/shared/api/gen/types.gen'

import { attemptsOptions } from '../queries'

/**
 * While revising returned work, the teacher's feedback on the returned attempt stays in view (the old web showed it
 * above the questions; here it was only on the returned attempt's result page).
 */
export function ReturnNote({ attempt }: { attempt: StudentSubmission }) {
  const { data: attempts } = useSuspenseQuery(attemptsOptions(attempt.assessment_id))
  const returned = attempts.find(
    previous => previous.attempt_number === attempt.attempt_number - 1 && previous.status === 'returned',
  )
  const feedback = returned?.grading?.feedback
  if (!feedback) return null
  return (
    <section className="flex flex-col gap-1 rounded-lg border p-4 text-sm">
      <h2 className="font-semibold">{m.attempt_feedback_heading()}</h2>
      <Suspense fallback={null}>
        <MarkdownView content={feedback} />
      </Suspense>
    </section>
  )
}
