import { Link as RouterLink } from '@tanstack/react-router'
import { Circle, CircleCheck, CircleDashed, type LucideIcon } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { CourseCover } from '#/shared/components/course-cover'
import { Progress } from '#/shared/components/progress'
import type { TrailRun } from '#/shared/api/gen/types.gen'
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

/** One started course as a card: cover, state, name, the server's progress and the way back in (the next activity, else the course). */
export function RunItem({ run }: { run: TrailRun }) {
  const state = runStateMeta[runState(run)]
  const next = nextActivity(run)
  const percent = Math.round(run.progress_pct ?? 0)
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <CourseCover seed={run.course_id} imageKey={run.course.thumbnail_key} className="aspect-video w-full" />
      <div className="flex flex-1 flex-col gap-3 p-4">
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
              <span className="text-muted-foreground tabular-nums">{m.learning_progress({ percent })}</span>
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
              {/* No next activity (none published yet): "Start" would promise what the course page cannot give. */}
              {m.learning_action_open()}
            </RouterLink>
          )}
        </div>
      </div>
    </article>
  )
}
