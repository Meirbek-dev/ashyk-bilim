import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { ContinueLearning } from '#/shared/api/gen/types.gen'
import { CourseCover } from '#/shared/components/course-cover'
import { Progress } from '#/shared/components/progress'
import { buttonVariants } from '#/shared/components/button-variants'

/**
 * A started course: its ornament, next activity, the server's progress and the way back into the player. The
 * primary one is the page's hero: cover beside the text from @2xl, a heavier title and bar.
 */
export function ContinueItem({ item, primary }: { item: ContinueLearning; primary: boolean }) {
  const percent = item.progress_pct === null ? null : Math.round(item.progress_pct)
  return (
    <article
      className={`flex w-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs ${primary ? '@2xl:flex-row' : ''}`}
    >
      <CourseCover
        seed={item.course_id}
        className={primary ? 'h-36 w-full @2xl:h-auto @2xl:min-h-56 @2xl:w-2/5' : 'h-20 w-full'}
      />
      <div className={`flex flex-1 flex-col gap-2 ${primary ? 'p-gutter @2xl:justify-center' : 'p-4'}`}>
        <h3 className={`wrap-anywhere ${primary ? 'text-2xl font-semibold' : 'text-lg font-medium'}`}>
          {item.course_name}
        </h3>
        <p className="text-sm wrap-anywhere text-muted-foreground">
          {m.home_continue_next({ activity: item.activity_name })}
        </p>
        {percent === null ? null : (
          <div className="flex max-w-md items-center gap-3">
            <Progress aria-hidden value={percent} className={`flex-1 ${primary ? 'progress-lg' : ''}`} />
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{m.home_progress({ percent })}</span>
          </div>
        )}
        <div className={primary ? 'pt-3' : 'mt-auto pt-2'}>
          <RouterLink
            to="/learn/$courseId/$activityId"
            params={{ courseId: item.course_id, activityId: item.activity_id }}
            className={
              primary ? buttonVariants({ size: 'lg', className: 'px-5' }) : buttonVariants({ variant: 'outline' })
            }
          >
            {m.home_continue_action()}
          </RouterLink>
        </div>
      </div>
    </article>
  )
}
