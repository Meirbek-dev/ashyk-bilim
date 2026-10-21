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

/**
 * The most recent started course, the page's hero: its picture beside the course, the next activity (type icon and
 * name), the server's progress and the one primary button back into the player.
 */
export function ContinueHero({ item }: { item: ContinueLearning }) {
  const percent = percentOf(item)
  return (
    <article className="grid overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs @2xl:grid-cols-5">
      {/* The text sets the row's height; an uploaded picture of any shape fills it (it once stretched the card to 440 px). */}
      <div className="relative aspect-video @2xl:col-span-2 @2xl:aspect-auto @2xl:min-h-60">
        <CourseCover seed={item.course_id} imageKey={item.thumbnail_key} className="absolute inset-0 size-full" />
      </div>
      <div className="flex flex-col justify-center gap-5 p-gutter @2xl:col-span-3 @2xl:px-8">
        <h3 className="text-2xl font-semibold wrap-anywhere">{item.course_name}</h3>
        <div className="flex items-center gap-3">
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
            className={buttonVariants({ size: 'lg', className: 'px-5' })}
          >
            {m.home_continue_action()}
          </RouterLink>
        </div>
      </div>
    </article>
  )
}
