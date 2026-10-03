import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { assessmentOptions, reviewOptions } from '../queries'
import { AssessmentGradeForm } from './assessment-grade-form'
import { HistorySection } from './history-section'
import type { ReviewAside } from './review-aside'
import { ReviewFrame } from './review-frame'

type AssessmentReviewProps = {
  courseId: string
  activityId: string
  submissionId: string
  aside?: ReviewAside | undefined
}

/** A quiz, exam or code submission under review: its answers with scores, then the history (B-GRD-10..17). */
export function AssessmentReview({ courseId, activityId, submissionId, aside }: AssessmentReviewProps) {
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activityId))
  const { data: submission } = useSuspenseQuery(reviewOptions(submissionId))
  const ids = { work: { kind: 'assessment', id: assessment.id } as const, courseId, submissionId }
  const items = assessment.items.toSorted((a, b) => a.position - b.position)
  return (
    <ReviewFrame work={ids.work} head={submission} aside={aside}>
      <section aria-labelledby="grading-answers" className="flex flex-col gap-4">
        <h2 id="grading-answers" className="text-xl font-semibold">
          {m.grading_answers()}
        </h2>
        {/* One form per submission: prev / next swap the work, not the inputs of the last one. */}
        <AssessmentGradeForm key={submission.id} ids={ids} submission={submission} items={items} />
      </section>
      <HistorySection key={`history-${submission.id}`} submissionId={submission.id} />
    </ReviewFrame>
  )
}
