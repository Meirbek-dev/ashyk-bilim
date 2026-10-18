import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'

import { attemptOptions, taskOptions } from '../queries'
import { FileGradeForm } from './file-grade-form'
import { FilesList } from './files-list'
import { Fold } from './fold'
import { HistorySection } from './history-section'
import type { ReviewAside } from './review-aside'
import { ReviewFrame } from './review-frame'

type FileReviewProps = { courseId: string; activityId: string; submissionId: string; aside?: ReviewAside | undefined }

/**
 * A file attempt under review: the task's instructions (folded), its files, then the rubric, grade and feedback
 * (B-GRD-16), then the history.
 */
export function FileReview({ courseId, activityId, submissionId, aside }: FileReviewProps) {
  const { data: task } = useSuspenseQuery(taskOptions(activityId))
  const { data: attempt } = useSuspenseQuery(attemptOptions(submissionId))
  const ids = { work: { kind: 'file', id: task.id } as const, courseId, submissionId }
  return (
    <ReviewFrame work={ids.work} head={attempt} aside={aside}>
      {task.instructions.trim() ? (
        <Fold title={m.grading_task()}>
          <Suspense>
            <MarkdownView content={task.instructions} />
          </Suspense>
        </Fold>
      ) : null}
      <section aria-labelledby="grading-files" className="flex flex-col gap-4">
        <h2 id="grading-files" className="text-xl font-semibold">
          {m.grading_files()}
        </h2>
        <FilesList files={attempt.files} />
      </section>
      <FileGradeForm key={attempt.id} ids={ids} attempt={attempt} rubric={task.rubric} />
      <HistorySection key={`history-${attempt.id}`} work={ids.work} submissionId={attempt.id} />
    </ReviewFrame>
  )
}
