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
    <div className="flex flex-col gap-gutter">
      <div className="flex flex-col gap-2">
        <p className="font-heading text-lg font-semibold wrap-anywhere">{state.title}</p>
        <Progress value={percent} aria-label={m.player_progress_label()} />
        <p className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground tabular-nums">
          <span>{m.player_progress({ done, total })}</span>
          <span aria-hidden className="font-heading text-base text-foreground">
            {formatPercent(Math.round(percent))}
          </span>
        </p>
      </div>
      {state.outline.map((chapter, index) => (
        <section key={chapter.id} aria-labelledby={`chapter-${chapter.id}`} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2.5 border-b pb-1.5">
            <span aria-hidden className="font-heading text-base text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <h2
              id={`chapter-${chapter.id}`}
              title={chapter.title}
              className="line-clamp-3 font-heading text-base font-semibold wrap-anywhere"
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
