import { m } from '#/paraglide/messages'
import type { ProgressState } from '#/shared/api/gen/types.gen'
import { Progress } from '#/shared/components/progress'
import { formatDate, formatPercent } from '#/shared/i18n/format'

/**
 * Where the learner stands. A finished course is a moment: a greeting in display type and the date, in the ink of the
 * colour they lie on (the page title stays «Итоги курса»). An unfinished one is summed up quietly: the percent large,
 * the thread, the count.
 */
export function CompletionHeader({ progress, completed }: { progress: ProgressState; completed: boolean }) {
  if (completed)
    return (
      <header className="flex min-w-0 flex-col gap-3">
        <h1 className="text-display font-semibold wrap-anywhere">{m.player_congrats()}</h1>
        <p className="text-xl">
          {progress.completed_at_unix
            ? m.player_completed_on({ date: formatDate(progress.completed_at_unix) })
            : m.player_completed()}
        </p>
      </header>
    )
  // A course with nothing to take yet has nothing to sum up: «0 %, 0 из 0» counts nothing.
  if (progress.total_required_count === 0)
    return <h1 className="text-3xl font-semibold wrap-anywhere">{m.player_finish()}</h1>
  return (
    <header className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold wrap-anywhere">{m.player_finish()}</h1>
      <p className="flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span aria-hidden className="font-heading text-display font-semibold">
          {formatPercent(Math.round(progress.progress_pct))}
        </span>
        <span className="text-muted-foreground">
          {m.player_progress({
            done: progress.completed_required_count,
            total: progress.total_required_count,
          })}
        </span>
      </p>
      <Progress value={progress.progress_pct} aria-label={m.player_progress_label()} className="progress-lg" />
    </header>
  )
}
