import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AiCourseAnalysisId, CourseId, FindingReview, Recommendation } from '#/shared/api/gen/types.gen'
import { vFindingReviewAction } from '#/shared/api/gen/valibot.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { findingLabels, findingStateLabels, levelLabels } from '../model/labels'
import { reviewFindingOptions } from '../queries'

type FindingRowProps = {
  courseId: CourseId
  analysisId: AiCourseAnalysisId
  /** The positional id the server accepts (`finding-{index}`): recommendations carry no id in the contract. */
  findingId: string
  recommendation: Recommendation
  /** The saved verdict (`finding_reviews[findingId]`): shown instead of the buttons. */
  review: FindingReview | undefined
}

/** One recommendation with the teacher's verdict buttons (B-AI-14), or the verdict once given (B-AI-28). */
export function FindingRow({ courseId, analysisId, findingId, recommendation, review }: FindingRowProps) {
  const queryClient = useQueryClient()
  const verdict = useMutation(reviewFindingOptions(queryClient, courseId))
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {recommendation.priority ? (
          <StatusBadge tone="info">{levelLabels[recommendation.priority]()}</StatusBadge>
        ) : null}
        <h4 className="font-medium wrap-anywhere">{recommendation.title}</h4>
      </div>
      {recommendation.rationale ? <p className="text-sm">{recommendation.rationale}</p> : null}
      {recommendation.action ? <p className="text-sm text-muted-foreground">{recommendation.action}</p> : null}
      {review ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge tone={review.action === 'dismissed' ? 'neutral' : 'success'}>
            {findingStateLabels[review.action]()}
          </StatusBadge>
          {formatDate(review.reviewed_at)}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {vFindingReviewAction.options.map(action => (
            <Button
              key={action}
              variant="outline"
              size="sm"
              disabled={verdict.isPending}
              onClick={() =>
                verdict.mutate(
                  { path: { analysis_id: analysisId }, body: { action, finding_id: findingId } },
                  { onSuccess: () => toast.add({ title: m.ai_finding_saved() }) },
                )
              }
            >
              {findingLabels[action]()}
            </Button>
          ))}
        </div>
      )}
    </li>
  )
}
