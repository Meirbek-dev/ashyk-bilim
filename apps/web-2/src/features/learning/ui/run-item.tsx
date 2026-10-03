import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Progress } from '#/shared/ui/progress'
import type { TrailRun } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { buttonVariants } from '#/shared/ui/button'

import { runState, type RunState } from '../model/learning'

export const runStateMeta = {
  in_progress: { label: m.learning_state_in_progress, tone: 'info', action: m.learning_action_continue },
  not_started: { label: m.learning_state_not_started, tone: 'neutral', action: m.learning_action_start },
  completed: { label: m.learning_state_completed, tone: 'success', action: m.learning_action_open },
} as const satisfies Record<RunState, { label: () => string; tone: string; action: () => string }>

/** One started course: name, state, the server's progress and the way back in (the course page, see SPEC). */
export function RunItem({ run }: { run: TrailRun }) {
  const state = runStateMeta[runState(run)]
  const percent = Math.round(run.progress_pct ?? 0)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 text-lg font-medium wrap-anywhere">
          <Link to="/courses/$courseId" params={{ courseId: run.course_id }}>
            {run.course.name}
          </Link>
        </h2>
        <StatusBadge tone={state.tone}>{state.label()}</StatusBadge>
        {run.course.archived_at_unix ? <StatusBadge tone="neutral">{m.learning_archived()}</StatusBadge> : null}
      </div>
      {run.course_total_steps === 0 ? (
        <p className="text-sm text-muted-foreground">{m.learning_no_activities()}</p>
      ) : (
        <div className="flex max-w-md items-center gap-3">
          <Progress aria-hidden value={percent} />
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {m.learning_progress({ percent })}
          </span>
        </div>
      )}
      <div className="mt-2">
        <RouterLink
          to="/courses/$courseId"
          params={{ courseId: run.course_id }}
          className={buttonVariants({ variant: 'outline' })}
        >
          {state.action()}
        </RouterLink>
      </div>
    </>
  )
}
