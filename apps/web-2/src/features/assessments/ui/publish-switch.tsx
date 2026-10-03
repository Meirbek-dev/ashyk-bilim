import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ActivityDetail, Lifecycle } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Switch } from '#/shared/ui/switch'
import { toast } from '#/shared/ui/toast'

import { can } from '../model/items'
import { assessmentOptions, lifecycleOptions } from '../queries'

/** A publish refused for readiness answers 422 with the blockers as field errors. */
const notReady = (error: unknown) => error instanceof ApiError && error.code === 'validation-failed'

/**
 * "Published" in the studio header for an assessment: on publishes it (the server flips the activity with it), off
 * asks first and returns it to draft (UX-200). Archived: off and locked; scheduling and archive live in `settings`.
 */
export function AssessmentPublishSwitch({ activity }: { activity: ActivityDetail }) {
  const labelId = useId()
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activity.id))
  const transition = useMutation(lifecycleOptions(useQueryClient(), activity.id, activity.course_id, assessment.id))
  const [confirming, setConfirming] = useState(false)
  const allowed = can(assessment, 'transition') && assessment.lifecycle !== 'archived'
  const set = (to: Lifecycle) =>
    transition.mutate(
      { path: { assessment_id: assessment.id }, body: { to } },
      {
        onSuccess: () => {
          setConfirming(false)
          toast.add({ title: to === 'published' ? m.assessments_toast_published() : m.assessments_toast_unpublished() })
        },
      },
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={labelId} className="text-sm">
        {m.assessments_published_switch()}
      </span>
      <Switch
        aria-labelledby={labelId}
        checked={assessment.lifecycle === 'published'}
        disabled={!allowed || transition.isPending}
        onCheckedChange={next => (next ? set('published') : setConfirming(true))}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={next => {
          setConfirming(next)
          if (!next) transition.reset()
        }}
        title={m.assessments_unpublish_title({ title: activity.name })}
        consequence={m.assessments_unpublish_consequence()}
        confirmLabel={m.assessments_unpublish()}
        onConfirm={() => set('draft')}
        pending={transition.isPending}
        error={transition.error}
      />
      {transition.error && !confirming ? (
        <span role="alert" className="max-w-64 text-sm text-destructive">
          {notReady(transition.error) ? (
            <>
              {m.assessments_not_ready()}{' '}
              <Link
                to="/teach/courses/$courseId/activities/$activityId/settings"
                params={{ courseId: activity.course_id, activityId: activity.id }}
                hash="publishing"
              >
                {m.assessments_not_ready_link()}
              </Link>
            </>
          ) : (
            presentError(transition.error)
          )}
        </span>
      ) : null}
    </div>
  )
}
