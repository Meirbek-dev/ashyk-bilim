import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import type { ActivityId, CourseId, LectureReview } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { critiqueQueue, reviewsKey, reviewsOptions } from '../queries'
import { LectureReviewCard } from './lecture-review-card'
import { RunStatus } from './run-status'
import { useAiRun } from './use-ai-run'

const ofActivity = (activityId: ActivityId) => (reviews: LectureReview[]) =>
  reviews.filter(review => review.activity_id === activityId && review.status === 'active')

/** Lecture critique in the activity studio (B-AI-18, N-5): the active reviews of this activity and a new run. */
export function CritiqueTab({ courseId, activityId }: { courseId: CourseId; activityId: ActivityId }) {
  const { data: reviews } = useSuspenseQuery({ ...reviewsOptions(courseId), select: ofActivity(activityId) })
  const run = useAiRun(critiqueQueue(courseId, activityId), [reviewsKey(courseId)])
  const start = () => run.start(getLocale())
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="outline" disabled={run.pending} onClick={start}>
          {m.ai_critique_run()}
        </Button>
      </div>
      <RunStatus state={run.state} onCancel={run.cancel} cancelling={run.cancelling} onRetry={start} />
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.ai_critique_empty()}</p>
      ) : (
        reviews.map(review => <LectureReviewCard key={review.id} courseId={courseId} review={review} />)
      )}
    </div>
  )
}
