import { m } from '#/paraglide/messages'
import type { RecentResult } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate, formatPercent } from '#/shared/i18n/format'

import { HomeSection } from './home-section'
import { resultKinds } from './labels'
import { PlayerLink } from './player-link'

/** Grades released and work returned in the last 14 days, newest first; hidden when there are none. */
export function ResultsSection({ results }: { results: readonly RecentResult[] }) {
  if (results.length === 0) return null
  return (
    <HomeSection title={m.home_results_title()}>
      <DataList
        variant="rows"
        items={results}
        getKey={result => `${result.kind}-${result.activity_id}-${result.at_unix}`}
      >
        {result => {
          const kind = resultKinds[result.kind]
          return (
            <div className="flex items-start gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div>
                  <StatusBadge tone={kind.tone}>{kind.label()}</StatusBadge>
                </div>
                <PlayerLink courseId={result.course_id} activityId={result.activity_id}>
                  {result.activity_name}
                </PlayerLink>
                <p className="text-sm wrap-anywhere text-muted-foreground">
                  {result.course_name} · {formatDate(result.at_unix)}
                </p>
              </div>
              {result.score === null ? null : (
                <p className="flex shrink-0 flex-col items-end">
                  <span className="sr-only">{m.home_score({ score: formatPercent(result.score) })}</span>
                  <span aria-hidden className="text-xs text-muted-foreground">
                    {m.home_score_label()}
                  </span>
                  <span aria-hidden className="font-heading text-2xl font-semibold tabular-nums">
                    {formatPercent(result.score)}
                  </span>
                </p>
              )}
            </div>
          )
        }}
      </DataList>
    </HomeSection>
  )
}
