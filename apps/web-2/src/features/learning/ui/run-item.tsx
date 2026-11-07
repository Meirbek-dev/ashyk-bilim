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
 * One started course: its picture, name, the server's progress, state and the way back in (the next activity, else the
 * course). A row with a thumbnail on a phone (33 full pictures are a long scroll), a card in the grid from @xl; the whole
 * of it opens the course (B-LRN-10).
 */
export function RunItem({ run }: { run: Enrollment }) {
  const state = runStateMeta[runState(run)]
  const next = nextActivity(run)
  const percent = Math.round(run.progress_pct ?? 0)
  const action = 'relative z-10 h-auto shrink-0 px-0 py-0'
  return (
    <article className="relative flex h-full gap-4 @xl:flex-col @xl:gap-3">
      <CourseCover
        imageKey={run.course.thumbnail_key}
        className="w-28 shrink-0 self-start rounded-md @xl:w-full @xl:rounded-lg"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="font-heading text-lg/snug font-medium wrap-anywhere">
          <Link variant="stretched" to="/courses/$courseId" params={{ courseId: run.course_id }}>
            {run.course.name}
          </Link>
        </h2>
        {/* The foot of the card: side by side, a finished course (no bar) and an open one keep their lines level. */}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          {run.course_total_steps === 0 ? (
            <p className="text-sm text-muted-foreground">{m.learning_no_activities()}</p>
          ) : runState(run) === 'completed' ? null : (
            <Progress aria-hidden value={percent} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`flex items-center gap-1.5 ${state.ink}`}>
                <state.icon aria-hidden className="size-4" />
                {state.label()}
              </span>
              {run.course_total_steps === 0 ? null : (
                <span className="text-muted-foreground tabular-nums">
                  {m.learning_progress({ percent: formatPercent(percent) })}
                </span>
              )}
              {run.course.archived_at_unix ? <StatusBadge tone="neutral">{m.learning_archived()}</StatusBadge> : null}
            </span>
            {next ? (
              <RouterLink
                to="/learn/$courseId/$activityId"
                params={{ courseId: run.course_id, activityId: next }}
                className={buttonVariants({ variant: 'link', size: 'sm', className: action })}
              >
                {state.action()}
              </RouterLink>
            ) : (
              <RouterLink
                to="/courses/$courseId"
                params={{ courseId: run.course_id }}
                className={buttonVariants({ variant: 'link', size: 'sm', className: action })}
              >
                {/* No next activity (none published yet, or archived): "Start" would promise what the course cannot give. */}
                {m.learning_action_open()}
              </RouterLink>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
