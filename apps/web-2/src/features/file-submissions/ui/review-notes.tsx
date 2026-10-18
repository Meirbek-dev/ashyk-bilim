import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { Attempt } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'
import { Skeleton } from '#/shared/ui/skeleton'

import { earlierNotes } from '../model/task'
import { reviewNotesOptions } from '../queries'
import { attemptStatus } from './labels'

/**
 * Every released review of the attempt under the work (B-FSB-22): a return comment stays readable after the learner
 * resubmits. The newest one is left out while `GradeDetails` already shows it.
 */
export function ReviewNotes({ attempt }: { attempt: Attempt }) {
  const { data } = useSuspenseQuery(reviewNotesOptions(attempt.id))
  const notes = earlierNotes(attempt, data)
  if (notes.length === 0) return null
  return (
    <section aria-labelledby="submission-review-history" className="flex flex-col gap-2">
      <h3 id="submission-review-history" className="text-lg font-semibold">
        {m.submission_review_history()}
      </h3>
      <ul className="flex flex-col divide-y">
        {notes.map(note => {
          const status = attemptStatus[note.status]
          return (
            <li key={note.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">{formatDateTime(note.created_at_unix)}</span>
                <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
                {note.final_score === null ? null : (
                  <span className="tabular-nums">{formatPercent(note.final_score)}</span>
                )}
              </div>
              {note.feedback ? (
                <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
                  <MarkdownView content={note.feedback} />
                </Suspense>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
