import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { Progress } from '#/shared/components/progress'
import { formatNumber } from '#/shared/i18n/format'

import { levelProgress } from '../model/achievements'
import { achievementsOptions } from '../queries'

/** The thread to the next level (server numbers only, UX-064), under the page's title: the one thing to read first. */
export function LevelThread() {
  const { data } = useSuspenseQuery(achievementsOptions())
  const { profile } = data
  const progress = levelProgress(profile)
  return (
    <section aria-label={m.achievements_level_title()} className="flex w-full max-w-xl flex-col gap-2">
      <h2 className="sr-only">{m.achievements_level_title()}</h2>
      <Progress value={progress.percent} aria-label={m.achievements_progress_label()} className="progress-lg" />
      <p className="text-sm text-muted-foreground tabular-nums">
        {progress.next === null
          ? m.achievements_max_level()
          : m.achievements_progress_left({ left: formatNumber(progress.left), next: progress.next })}
      </p>
    </section>
  )
}
