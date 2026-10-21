import { ChevronRight } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'
import type { ContinueLearning } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { Progress } from '#/shared/components/progress'

import { percentOf } from './continue-hero'

/** Another started course as one row: thumbnail, name (the whole row opens its next activity), next step, progress. */
export function ContinueRow({ item }: { item: ContinueLearning }) {
  const percent = percentOf(item)
  return (
    <article className="relative flex items-center gap-4 rounded-xl p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground">
      <CourseCover
        seed={item.course_id}
        imageKey={item.thumbnail_key}
        shape="thumb"
        className="aspect-video w-24 shrink-0 rounded-lg border @md:w-32"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-medium wrap-anywhere">
          <Link
            variant="stretched"
            to="/learn/$courseId/$activityId"
            params={{ courseId: item.course_id, activityId: item.activity_id }}
          >
            {item.course_name}
          </Link>
        </h3>
        <p className="line-clamp-1 text-sm wrap-anywhere text-muted-foreground">
          {m.home_continue_next({ activity: item.activity_name })}
        </p>
        {percent === null ? null : (
          <div className="flex max-w-xs items-center gap-2">
            <Progress aria-hidden value={percent} className="flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {m.home_progress({ percent: formatPercent(percent) })}
            </span>
          </div>
        )}
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </article>
  )
}
