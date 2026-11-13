import { m } from '#/paraglide/messages'
import type { ProgressState } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'

import { valueLine } from '../model/value-line'

type CompletionFactsProps = {
  progress: ProgressState
  /** The course has a certificate set up. */
  certificateConfigured: boolean
  /** The verify code of the issued certificate, when there is one. */
  code: string | null
}

/** The figures under the summary: the grade average, works waiting for a grade, a certificate still being issued. */
export function CompletionFacts({ progress, certificateConfigured, code }: CompletionFactsProps) {
  const average =
    typeof progress.grade_average === 'number'
      ? valueLine(
          m.player_grade_average({ value: formatPercent(progress.grade_average) }),
          formatPercent(progress.grade_average),
        )
      : null
  return (
    <div className="flex w-full flex-col gap-3 text-sm empty:hidden">
      {/* The figure under its words, on the page's left edge: across a wide column the two drifted apart. */}
      {average ? (
        <p className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">{average.label}</span>
          {average.value ? (
            <span className="font-heading text-xl font-semibold tabular-nums">{average.value}</span>
          ) : null}
        </p>
      ) : null}
      {progress.needs_grading_count > 0 ? (
        <p className="text-muted-foreground">{m.player_needs_grading({ count: progress.needs_grading_count })}</p>
      ) : null}
      {certificateConfigured && !code ? (
        <p className="text-muted-foreground">{m.player_certificate_pending()}</p>
      ) : null}
    </div>
  )
}
