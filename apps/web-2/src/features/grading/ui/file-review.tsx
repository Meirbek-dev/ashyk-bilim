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
  const ids = { work: { kind: 'file', id: task.id } as const, courseId, activityId, submissionId }
  return (
    <ReviewFrame work={ids.work} head={attempt} aside={aside}>
      {/* The work on the left, read like a page; the marking column beside it stays in sight while it scrolls. */}
      <div className="grid gap-x-10 gap-y-8 @3xl/review:grid-cols-[minmax(0,1fr)_20rem] @3xl/review:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-8 @3xl/review:col-start-1">
          {task.instructions.trim() ? (
            <Fold title={m.grading_task()}>
              <Suspense>
                <MarkdownView content={task.instructions} />
              </Suspense>
            </Fold>
          ) : null}
          <section aria-labelledby="grading-files" className="flex flex-col gap-3">
            <h2 id="grading-files" className="text-xl font-semibold">
              {m.grading_files()}
            </h2>
            {/* Keyed: «Следующая работа» must not keep the previous learner's preview open. */}
            <FilesList key={attempt.id} files={attempt.files} />
          </section>
        </div>
        <div className="@3xl/review:sticky @3xl/review:top-20 @3xl/review:col-start-2 @3xl/review:row-span-2 @3xl/review:row-start-1 @3xl/review:max-h-[calc(100dvh-6rem)] @3xl/review:self-start @3xl/review:overflow-y-auto @3xl/review:border-l @3xl/review:px-1 @3xl/review:pl-8">
          <FileGradeForm key={attempt.id} ids={ids} attempt={attempt} rubric={task.rubric} />
        </div>
        <div className="@3xl/review:col-start-1">
          <HistorySection key={`history-${attempt.id}`} work={ids.work} submissionId={attempt.id} />
        </div>
      </div>
    </ReviewFrame>
  )
}
