import { useSuspenseQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'

import { BulkWrite } from '#/features/conversations'

import { m } from '#/paraglide/messages'
import { KpiStrip } from '#/shared/components/charts/kpi-strip'
import { KpiTile } from '#/shared/components/charts/kpi-tile'
import { formatNumber } from '#/shared/i18n/format'

import { exportHrefs } from '../model/analytics'
import { pickFilters } from '../model/filters'
import { atRiskOptions, overviewOptions } from '../queries'
import { AtRiskTable } from './at-risk-table'
import { ExportLinks } from './export-links'
import { LearnerSheet } from './learner-sheet'
import { LearnerLookup } from './learner-lookup'

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
  // One course in the list (the course filter): its at-risk learners can get one message, each an intervention.
  const course = atRisk.items[0]?.course_id
  const oneCourse = course && atRisk.items.every(row => row.course_id === course) ? course : null
  return (
    <div className="flex flex-col gap-10">
      <KpiStrip label={m.analytics_kpis()} columns={3}>
        {tiles.map(tile => (
          <KpiTile key={tile.label} label={tile.label} value={formatNumber(tile.value)} />
        ))}
      </KpiStrip>
      {oneCourse && atRisk.items.length > 1 ? (
        <div>
          <BulkWrite
            courseId={oneCourse}
            people={atRisk.items.map(row => ({ id: row.user_id, name: row.user_display_name || row.user_username }))}
            intervention
            label={m.analytics_write_all_at_risk()}
          />
        </div>
      ) : null}
      <AtRiskTable search={search} filters={filters} />
      <ExportLinks links={[{ href: exportHrefs(filters).atRisk, label: m.analytics_export_at_risk() }]} />
      {learnerId && courseId ? (
        open ? (
          <LearnerSheet key={`${learnerId}:${courseId}`} learnerId={learnerId} courseId={courseId} row={open} />
        ) : (
          <LearnerLookup key={`${learnerId}:${courseId}`} learnerId={learnerId} courseId={courseId} filters={filters} />
        )
      ) : null}
    </div>
  )
}
