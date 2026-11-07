import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'
import type { ContinueLearning } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { buttonVariants } from '#/shared/components/button-variants'
import { CourseCover } from '#/shared/components/course-cover'
import { Progress } from '#/shared/components/progress'
import { activityTypeMeta } from '#/shared/i18n/labels'

export const percentOf = (item: ContinueLearning) => (item.progress_pct === null ? null : Math.round(item.progress_pct))

/** Nothing done or handed in yet (the server's `started`, as «Мои курсы» counts it): «Начать», not «Продолжить». */
export const notStarted = (item: ContinueLearning) => !item.started

/**
 * The most recent started course, the page's hero: its picture, the next activity (type icon and name), the server's
 * progress and the one primary button back into the player.
 */
export function ContinueHero({ item }: { item: ContinueLearning }) {
  const percent = percentOf(item)
  return (
    <article className="flex flex-col gap-5 @xl:flex-row @xl:items-center @xl:gap-8 @3xl:gap-10">
      <CourseCover imageKey={item.thumbnail_key} className="shrink-0 @xl:w-56 @3xl:w-80" />
      <div className="flex min-w-0 flex-1 flex-col gap-4 @xl:gap-5">
        <h3 className="text-xl font-semibold wrap-anywhere @xl:text-2xl">{item.course_name}</h3>
        <div className="flex items-start gap-3">
          <ActivityIcon type={item.activity_type} />
          <p className="flex min-w-0 flex-col">
            <span className="text-sm text-muted-foreground">
              {m.home_continue_next({ activity: activityTypeMeta[item.activity_type].label() })}
            </span>
            <span className="font-medium wrap-anywhere">{item.activity_name}</span>
          </p>
        </div>
        {percent === null ? null : (
          <div className="flex max-w-md items-center gap-3">
            <Progress aria-hidden value={percent} className="progress-lg flex-1" />
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {m.home_progress({ percent: formatPercent(percent) })}
            </span>
          </div>
        )}
        <div>
          <RouterLink
            to="/learn/$courseId/$activityId"
            params={{ courseId: item.course_id, activityId: item.activity_id }}
            className={buttonVariants({ size: 'lg' })}
          >
            {notStarted(item) ? m.home_start_action() : m.home_continue_action()}
          </RouterLink>
        </div>
      </div>
    </article>
  )
}
