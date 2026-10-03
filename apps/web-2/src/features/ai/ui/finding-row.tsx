import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AiCourseAnalysisId, CourseId, Recommendation } from '#/shared/api/gen/types.gen'
import { vFindingReviewAction } from '#/shared/api/gen/valibot.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { findingLabels, levelLabels } from '../model/labels'
import { reviewFindingOptions } from '../queries'

type FindingRowProps = {
  courseId: CourseId
  analysisId: AiCourseAnalysisId
  /** The positional id the server accepts (`finding-{index}`): recommendations carry no id in the contract. */
  findingId: string
  recommendation: Recommendation
}

/** One recommendation with the teacher's verdict buttons (B-AI-14). */
export function FindingRow({ courseId, analysisId, findingId, recommendation }: FindingRowProps) {
  const queryClient = useQueryClient()
  const review = useMutation(reviewFindingOptions(queryClient, courseId))
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
      <div className="flex flex-wrap gap-2">
        {vFindingReviewAction.options.map(action => (
          <Button
            key={action}
            variant="outline"
            size="sm"
            disabled={review.isPending}
            onClick={() =>
              review.mutate(
                { path: { analysis_id: analysisId }, body: { action, finding_id: findingId } },
                { onSuccess: () => toast.add({ title: m.ai_finding_saved() }) },
              )
            }
          >
            {findingLabels[action]()}
          </Button>
        ))}
      </div>
    </li>
  )
}
