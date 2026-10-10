import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { ContinueLearning } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/ui/button'
import { Progress } from '#/shared/ui/progress'

/** A started course: its next activity, the server's progress and the way back into the player. */
export function ContinueItem({ item, primary }: { item: ContinueLearning; primary: boolean }) {
  const percent = item.progress_pct === null ? null : Math.round(item.progress_pct)
  return (
    <>
      <h3 className="text-lg font-medium wrap-anywhere">{item.course_name}</h3>
      <p className="text-sm wrap-anywhere text-muted-foreground">
        {m.home_continue_next({ activity: item.activity_name })}
      </p>
      {percent === null ? null : (
        <div className="flex max-w-md items-center gap-3">
          <Progress aria-hidden value={percent} className="flex-1" />
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{m.home_progress({ percent })}</span>
        </div>
      )}
      <div className="mt-2">
        <RouterLink
          to="/learn/$courseId/$activityId"
          params={{ courseId: item.course_id, activityId: item.activity_id }}
          className={buttonVariants({ variant: primary ? 'default' : 'outline' })}
        >
          {m.home_continue_action()}
        </RouterLink>
      </div>
    </>
  )
}
