import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { formatDateTime } from '#/shared/i18n/format'

import { can } from '../model/route'
import { lifecycleBadges } from './labels'
import { LifecycleActions } from './lifecycle-actions'
import { ReadinessList } from './readiness-list'

type PublishingSectionProps = { courseId: string; activityId: string; title: string; assessment: AssessmentDetail }

/** "Publishing": the state, the server's readiness and the lifecycle actions the caller may take. */
export function PublishingSection({ courseId, activityId, title, assessment }: PublishingSectionProps) {
  const badge = lifecycleBadges[assessment.lifecycle]
  return (
    <section aria-labelledby="publishing-title" className="flex max-w-prose flex-col gap-4">
      <div className="flex flex-col gap-1">
        {/* The state as a word beside the heading (DESIGN 9), as on a course: the one amber draft stands out. */}
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="publishing-title" className="text-xl font-semibold">
            {m.assessments_nav_publishing()}
          </h2>
          <span className={`text-sm ${assessment.lifecycle === 'draft' ? 'text-warning' : 'text-muted-foreground'}`}>
            {badge.label()}
          </span>
          {assessment.scheduled_at_unix ? (
            <span className="text-sm text-muted-foreground">
              {m.assessments_scheduled_at({ date: formatDateTime(assessment.scheduled_at_unix) })}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{m.assessments_publishing_hint()}</p>
      </div>
      <ReadinessList courseId={courseId} activityId={activityId} assessment={assessment} />
      {can(assessment, 'transition') ? (
        <LifecycleActions activityId={activityId} title={title} assessment={assessment} />
      ) : null}
    </section>
  )
}
