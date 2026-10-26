import { Link as RouterLink } from '@tanstack/react-router'
import { Circle, CircleCheck, CircleDashed, type LucideIcon } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'
import { CourseCover } from '#/shared/components/course-cover'
import { Progress } from '#/shared/components/progress'
import type { Enrollment } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { buttonVariants } from '#/shared/components/button-variants'

import { nextActivity, runState, type RunState } from '../model/learning'

export const runStateMeta = {
  in_progress: {
    label: m.learning_state_in_progress,
    icon: CircleDashed,
    ink: 'text-info',
    action: m.learning_action_continue,
  },
  not_started: {
    label: m.learning_state_not_started,
    icon: Circle,
    ink: 'text-muted-foreground',
    action: m.learning_action_start,
  },
  completed: {
    label: m.learning_state_completed,
    icon: CircleCheck,
    ink: 'text-success',
    action: m.learning_action_open,
  },
} as const satisfies Record<RunState, { label: () => string; icon: LucideIcon; ink: string; action: () => string }>

/**
 * One started course: cover, state, name, the server's progress and the way back in (the next activity, else the
 * course). A thumbnail row in one column (phone), a cover card in the grid (B-LRN-10).
 */
export function RunItem({ run }: { run: Enrollment }) {
  const state = runStateMeta[runState(run)]
  const next = nextActivity(run)
  const percent = Math.round(run.progress_pct ?? 0)
  return (
    // A row with a thumbnail on a phone (33 full covers were a 14 000 px scroll), a cover card from two columns on.
    <article className="relative flex h-full overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs @xl:flex-col">
      <CourseCover
        seed={run.course_id}
        imageKey={run.course.thumbnail_key}
        className="m-3 aspect-video w-24 shrink-0 self-start rounded-md @xl:m-0 @xl:w-full @xl:rounded-none"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 py-3 pr-3 @xl:p-4">
        <h2 className="min-w-0 font-semibold wrap-anywhere">
          <Link variant="title" to="/courses/$courseId" params={{ courseId: run.course_id }}>
            {run.course.name}
          </Link>
        </h2>
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className={`flex items-center gap-1.5 font-medium ${state.ink}`}>
              <state.icon aria-hidden className="size-4" />
              {state.label()}
            </span>
            {run.course.archived_at_unix ? <StatusBadge tone="neutral">{m.learning_archived()}</StatusBadge> : null}
            {run.course_total_steps === 0 ? null : (
              <span className="text-muted-foreground tabular-nums">
                {m.learning_progress({ percent: formatPercent(percent) })}
              </span>
            )}
          </div>
          {run.course_total_steps === 0 ? (
            <p className="text-sm text-muted-foreground">{m.learning_no_activities()}</p>
          ) : runState(run) === 'completed' ? null : (
            <Progress aria-hidden value={percent} />
          )}
        </div>
        <div className="pt-1">
          {next ? (
            <RouterLink
              to="/learn/$courseId/$activityId"
              params={{ courseId: run.course_id, activityId: next }}
              className={buttonVariants({ variant: 'secondary' })}
            >
              {state.action()}
            </RouterLink>
          ) : (
            <RouterLink
              to="/courses/$courseId"
              params={{ courseId: run.course_id }}
              className={buttonVariants({ variant: 'secondary' })}
            >
              {/* No next activity (none published yet, or archived): "Start" would promise what the course cannot give. */}
              {m.learning_action_open()}
            </RouterLink>
          )}
        </div>
      </div>
    </article>
  )
}
