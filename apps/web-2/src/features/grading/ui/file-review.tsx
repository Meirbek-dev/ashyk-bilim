import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { attemptOptions, taskOptions } from '../queries'
import { FileGradeForm } from './file-grade-form'
import { FilesList } from './files-list'
import type { ReviewAside } from './review-aside'
import { ReviewFrame } from './review-frame'

type FileReviewProps = { courseId: string; activityId: string; submissionId: string; aside?: ReviewAside | undefined }

/** A file attempt under review: its files, then the rubric, grade and feedback (B-GRD-16). */
export function FileReview({ courseId, activityId, submissionId, aside }: FileReviewProps) {
  const { data: task } = useSuspenseQuery(taskOptions(activityId))
  const { data: attempt } = useSuspenseQuery(attemptOptions(submissionId))
  const ids = { work: { kind: 'file', id: task.id } as const, courseId, submissionId }
  return (
    <ReviewFrame work={ids.work} head={attempt} aside={aside}>
      <section aria-labelledby="grading-files" className="flex flex-col gap-4">
        <h2 id="grading-files" className="text-xl font-semibold">
          {m.grading_files()}
        </h2>
        <FilesList files={attempt.files} />
      </section>
      <FileGradeForm key={attempt.id} ids={ids} attempt={attempt} rubric={task.rubric} />
    </ReviewFrame>
  )
}
