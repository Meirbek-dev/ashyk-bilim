import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { Progress } from '#/shared/components/progress'
import { formatNumber } from '#/shared/i18n/format'

import { levelProgress } from '../model/achievements'
import { achievementsOptions } from '../queries'
import { FigureLabel, figureCell, figureNote, figureValue } from './figure-label'

/** The level and the thread to the next one (server numbers only, UX-064): the first figure of the line. */
export function LevelThread() {
  const { data } = useSuspenseQuery(achievementsOptions())
  const { profile } = data
  const progress = levelProgress(profile)
  return (
    <section aria-label={m.achievements_level_title()} className={figureCell}>
      <FigureLabel>{m.achievements_level_title()}</FigureLabel>
      {/* The page's title line says the level in words. */}
      <p aria-hidden className={figureValue}>
        {profile.level}
      </p>
      <Progress value={progress.percent} aria-label={m.achievements_progress_label()} />
      <p className={figureNote}>
        {progress.next === null
          ? m.achievements_max_level()
          : m.achievements_progress_left({ left: formatNumber(progress.left), next: progress.next })}
      </p>
    </section>
  )
}
