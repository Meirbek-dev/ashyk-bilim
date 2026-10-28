import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { LearnerCourseState } from '#/shared/api/gen/types.gen'
import { Progress } from '#/shared/components/progress'
import { ProgressRing } from '#/shared/components/progress-ring'
import { formatPercent } from '#/shared/i18n/format'

import { ContentsRow } from './contents-row'

/** The course contents: progress ring, numbered chapters and activities with marks and locks, as the server sent them. */
export function Contents({
  state,
  onPick,
  nowUnix,
}: {
  state: LearnerCourseState
  onPick: () => void
  nowUnix: number
}) {
  const { completed_required_count: done, total_required_count: total, progress_pct: percent } = state.progress
  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex items-center gap-3">
        <ProgressRing value={percent} className="size-14">
          {/* "100 %" is wider than the ring: a finished course shows a check (the count is in the text beside). */}
          {percent >= 100 ? (
            <Check aria-hidden className="size-6" />
          ) : (
            <span aria-hidden className="font-heading text-sm font-semibold tabular-nums">
              {formatPercent(Math.round(percent))}
            </span>
          )}
        </ProgressRing>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-heading font-semibold wrap-anywhere">{state.title}</p>
          <Progress value={percent} aria-label={m.player_progress_label()} className="sr-only" />
          <p className="text-sm text-muted-foreground tabular-nums">{m.player_progress({ done, total })}</p>
        </div>
      </div>
      {state.outline.map((chapter, index) => (
        <section key={chapter.id} aria-labelledby={`chapter-${chapter.id}`} className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-1">
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full border bg-card font-heading text-xs font-semibold tabular-nums"
            >
              {index + 1}
            </span>
            <h2
              id={`chapter-${chapter.id}`}
              title={chapter.title}
              className="line-clamp-3 text-sm font-semibold wrap-anywhere"
            >
              {chapter.title}
            </h2>
          </div>
          <ol className="flex flex-col gap-0.5">
            {chapter.activities.map(activity => (
              <li key={activity.id}>
                <ContentsRow courseId={state.course_id} activity={activity} onPick={onPick} nowUnix={nowUnix} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
