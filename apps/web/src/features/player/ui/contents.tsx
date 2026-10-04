import { m } from '#/paraglide/messages'
import type { LearnerCourseState } from '#/shared/api/gen/types.gen'
import { Progress } from '#/shared/ui/progress'

import { ContentsRow } from './contents-row'

/** The course contents: progress, chapters and activities with marks and locks, all as the server sent them. */
export function Contents({ state, onPick }: { state: LearnerCourseState; onPick: () => void }) {
  const { completed_required_count: done, total_required_count: total, progress_pct: percent } = state.progress
  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex flex-col gap-2">
        <p className="font-semibold wrap-anywhere">{state.title}</p>
        <Progress value={percent} aria-label={m.player_progress_label()} />
        <p className="text-sm text-muted-foreground tabular-nums">{m.player_progress({ done, total })}</p>
      </div>
      {state.outline.map(chapter => (
        <section key={chapter.id} aria-labelledby={`chapter-${chapter.id}`} className="flex flex-col gap-1">
          <h2 id={`chapter-${chapter.id}`} className="text-sm font-semibold wrap-anywhere">
            {chapter.title}
          </h2>
          <ol className="flex flex-col gap-0.5">
            {chapter.activities.map(activity => (
              <li key={activity.id}>
                <ContentsRow courseId={state.course_id} activity={activity} onPick={onPick} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
