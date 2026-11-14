import { m } from '#/paraglide/messages'
import type { LearnerCourseState } from '#/shared/api/gen/types.gen'
import { Progress } from '#/shared/components/progress'
import { formatPercent } from '#/shared/i18n/format'

import { ContentsRow } from './contents-row'

/** The course contents: the course's thread, numbered chapters and activities with marks and locks, as the server sent them. */
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="font-heading text-lg font-semibold wrap-anywhere">{state.title}</p>
        <p className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground tabular-nums">
          <span>{m.player_progress({ done, total })}</span>
          <span aria-hidden className="font-medium text-foreground">
            {formatPercent(Math.round(percent))}
          </span>
        </p>
        <Progress value={percent} aria-label={m.player_progress_label()} />
      </div>
      {state.outline.map((chapter, index) => (
        <section key={chapter.id} aria-labelledby={`chapter-${chapter.id}`} className="flex flex-col gap-1">
          {/* The number stands in the rows' icon column, the title on their text edge. */}
          <div className="flex items-baseline gap-3 px-3 py-1">
            <span aria-hidden className="w-5 shrink-0 text-center text-sm text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <h2
              id={`chapter-${chapter.id}`}
              title={chapter.title}
              className="line-clamp-2 min-w-0 font-sans text-sm font-semibold wrap-anywhere"
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
