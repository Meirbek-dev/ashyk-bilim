import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentKind } from '#/shared/api/gen/types.gen'
import { Bars } from '#/shared/components/charts/bars'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { formatNumber } from '#/shared/i18n/format'
import { activityTypeMeta } from '#/shared/i18n/labels'

import type { Filters } from '../model/filters'
import { assessmentOptions } from '../queries'
import { BackLink } from './back-link'
import { DrillSection } from './drill-section'
import { hours, percent, score } from './kpi'

type AssessmentDrillProps = { filters: Filters; type: AssessmentKind; id: string; page: number }

/** One assessment (`?assessmentType=&assessmentId=`): outcomes, the score spread, and each learner's result. */
export function AssessmentDrill({ filters, type, id, page }: AssessmentDrillProps) {
  const { data } = useSuspenseQuery(assessmentOptions(filters, type, id))
  const summary = data.summary
  const tiles = [
    { label: m.analytics_eligible(), value: formatNumber(summary.eligible_learners) },
    { label: m.analytics_submitted(), value: formatNumber(summary.submitted_learners) },
    { label: m.analytics_col_submission(), value: percent(summary.submission_rate) },
    { label: m.analytics_col_pass(), value: percent(summary.pass_rate) },
    { label: m.analytics_col_median(), value: score(summary.median_score) },
    { label: m.analytics_col_latency(), value: hours(summary.grading_latency_hours_p50) },
  ]
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-start gap-2">
        <BackLink />
        <h2 className="text-xl font-semibold wrap-anywhere">{data.title}</h2>
        <p className="text-sm text-muted-foreground">
          {activityTypeMeta[data.assessment_type].label()} ·{' '}
          {m.analytics_pass_threshold({ value: formatNumber(data.pass_threshold) })}
        </p>
      </div>
      <section aria-label={m.analytics_kpis()} className="grid grid-cols-2 gap-4 @3xl:grid-cols-3">
        {tiles.map(tile => (
          <KpiTile key={tile.label} label={tile.label} value={tile.value} />
        ))}
      </section>
      <Bars
        title={m.analytics_score_distribution()}
        data={data.score_distribution.map(bucket => ({ label: bucket.label, value: bucket.count }))}
        formatValue={value => formatNumber(value)}
      />
      <DrillSection
        title={m.analytics_pass_rows()}
        metric="pass_rate"
        page={page}
        filters={filters}
        assessment={{ assessment_type: type, assessment_id: id }}
      />
    </div>
  )
}
