import { Check } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { ProgressState } from '#/shared/api/gen/types.gen'
import { Progress } from '#/shared/components/progress'
import { ProgressRing } from '#/shared/components/progress-ring'
import { formatDate, formatPercent } from '#/shared/i18n/format'

/** Where the learner stands: a seal (the reward ring with a check once done, else the percent), the title, the date or
 * the count. */
export function CompletionHeader({ progress, completed }: { progress: ProgressState; completed: boolean }) {
  return (
    <header className="flex flex-col items-center gap-4 text-center">
      <ProgressRing
        value={completed ? 100 : progress.progress_pct}
        tone={completed ? 'stroke-reward' : 'stroke-primary'}
        className="size-24"
      >
        {completed ? (
          <Check aria-hidden className="size-10 text-reward" />
        ) : (
          <span aria-hidden className="font-heading text-lg font-semibold tabular-nums">
            {formatPercent(Math.round(progress.progress_pct))}
          </span>
        )}
      </ProgressRing>
      <div className="flex min-w-0 flex-col items-center gap-1">
        {/* A finished course is a moment: it is greeted, not only summed up (the page title stays «Итоги курса»). */}
        <h1 className="text-display font-semibold">{completed ? m.player_congrats() : m.player_finish()}</h1>
        {completed ? (
          <p className="text-lg">
            {progress.completed_at_unix
              ? m.player_completed_on({ date: formatDate(progress.completed_at_unix) })
              : m.player_completed()}
          </p>
        ) : (
          <>
            <Progress value={progress.progress_pct} aria-label={m.player_progress_label()} className="sr-only" />
            <p className="text-muted-foreground tabular-nums">
              {m.player_progress({
                done: progress.completed_required_count,
                total: progress.total_required_count,
              })}
            </p>
          </>
        )}
      </div>
    </header>
  )
}
