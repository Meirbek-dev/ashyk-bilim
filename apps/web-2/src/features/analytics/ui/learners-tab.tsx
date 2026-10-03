import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'
import { KpiTile } from '#/shared/ui/charts/kpi-tile'

import { exportHrefs } from '../model/analytics'
import { pickFilters } from '../model/filters'
import { atRiskOptions, overviewOptions } from '../queries'
import { AtRiskTable } from './at-risk-table'
import { ExportLinks } from './export-links'
import { LearnerSheet } from './learner-sheet'

/**
 * The learners tab (the old at-risk page merged in, spec 5.6): risk counts and interventions, the at-risk list, and
 * the learner open in a side panel (`?learnerId=&courseId=`).
 */
export function LearnersTab() {
  const search = useSearch({ from: '/_authed/teach/analytics/learners' })
  const filters = pickFilters(search)
  const { data: overview } = useSuspenseQuery(overviewOptions(filters))
  const { data: atRisk } = useSuspenseQuery(atRiskOptions(filters, search))
  const { learnerId, courseId } = search
  const summary = overview.intervention_summary
  const tiles = [
    { label: m.analytics_tile_risk_high(), value: overview.risk_distribution.high },
    { label: m.analytics_tile_risk_medium(), value: overview.risk_distribution.medium },
    { label: m.analytics_interventions_total(), value: summary.total },
    { label: m.analytics_interventions_open(), value: summary.open },
    { label: m.analytics_interventions_resolved(), value: summary.resolved },
    { label: m.analytics_interventions_recovered(), value: summary.recovered_learners },
  ]
  const open = atRisk.items.find(row => row.user_id === learnerId && row.course_id === courseId)
  return (
    <div className="flex flex-col gap-8">
      <section aria-label={m.analytics_kpis()} className="grid grid-cols-2 gap-4 @4xl:grid-cols-3">
        {tiles.map(tile => (
          <KpiTile key={tile.label} label={tile.label} value={formatNumber(tile.value)} />
        ))}
      </section>
      <AtRiskTable search={search} filters={filters} />
      <ExportLinks links={[{ href: exportHrefs(filters).atRisk, label: m.analytics_export_at_risk() }]} />
      {learnerId && courseId ? (
        <LearnerSheet
          key={`${learnerId}:${courseId}`}
          learnerId={learnerId}
          courseId={courseId}
          name={open?.user_display_name}
          course={open?.course_name}
        />
      ) : null}
    </div>
  )
}
