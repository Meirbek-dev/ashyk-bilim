import { useMutation } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { formatNumber } from '#/shared/i18n/format'

import { queueDraftsOptions } from '../mutations'

type PrepareDraftsProps = { ids: { courseId: string; activityId: string }; preparing: number }

/**
 * The queue's AI row (B-GRD-41): «Подготовить черновики» for every work waiting for a grade without a fresh draft,
 * then how many were queued and skipped; drafts being written; the activity's grading consistency.
 */
export function PrepareDrafts({ ids, preparing }: PrepareDraftsProps) {
  const prepare = useMutation(queueDraftsOptions(ids.activityId))
  const report = prepare.data
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          type="button"
          variant="outline"
          pending={prepare.isPending}
          onClick={() => prepare.mutate({ path: { activity_id: ids.activityId }, body: {} })}
        >
          {m.grading_ai_prepare()}
        </SubmitButton>
        <RouterLink
          className={buttonVariants({ variant: 'ghost' })}
          to="/teach/courses/$courseId/activities/$activityId/consistency"
          params={ids}
        >
          {m.grading_ai_consistency()}
        </RouterLink>
        <output className="text-sm text-muted-foreground tabular-nums">
          {report
            ? m.grading_ai_prepared({
                queued: formatNumber(report.queued.length),
                skipped: formatNumber(report.skipped),
              })
            : preparing > 0
              ? m.grading_ai_preparing({ count: formatNumber(preparing) })
              : null}
        </output>
      </div>
      {prepare.error ? <ErrorAlert>{presentError(prepare.error)}</ErrorAlert> : null}
    </div>
  )
}
