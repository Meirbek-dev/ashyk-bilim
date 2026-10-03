import { m } from '#/paraglide/messages'
import type { RecentResult } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate, formatNumber } from '#/shared/i18n/format'

import { HomeSection } from './home-section'
import { resultKinds } from './labels'
import { PlayerLink } from './player-link'

/** Grades released and work returned in the last 14 days, newest first; hidden when there are none. */
export function ResultsSection({ results }: { results: readonly RecentResult[] }) {
  if (results.length === 0) return null
  return (
    <HomeSection title={m.home_results_title()}>
      <DataList items={results} getKey={result => `${result.kind}-${result.activity_id}-${result.at_unix}`}>
        {result => {
          const kind = resultKinds[result.kind]
          return (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge tone={kind.tone}>{kind.label()}</StatusBadge>
                {result.score === null ? null : (
                  <span className="tabular-nums">{m.home_score({ score: formatNumber(result.score) })}</span>
                )}
              </div>
              <PlayerLink courseId={result.course_id} activityId={result.activity_id}>
                {result.activity_name}
              </PlayerLink>
              <p className="text-sm wrap-anywhere text-muted-foreground">
                {result.course_name} · {formatDate(result.at_unix)}
              </p>
            </>
          )
        }}
      </DataList>
    </HomeSection>
  )
}
