import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import type { ReactElement } from 'react'

import { m } from '#/paraglide/messages'
import { DataTable } from '#/shared/components/data-table'

import { labelsFromDrafts } from '../model/consistency'
import { consistencyOptions, draftsOptions } from '../queries'
import { ConsistencyBlock } from './consistency-block'
import { disagreementColumns, driftColumns, pairColumns } from './consistency-columns'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId/consistency'

/**
 * An activity's grading consistency (docs/AI-FIRST.md 4.5): similar works graded apart (B-AIG-06), works whose grade
 * left the AI draft far behind (B-AIG-07), and how the AI leans per criterion against the teachers (B-AIG-08).
 */
// The return type is spelled out: the route's own types refer back to this component (TS7023).
export function ConsistencyPage(): ReactElement {
  const ids = useParams({ from: ROUTE })
  const { data: report } = useSuspenseQuery(consistencyOptions(ids.activityId))
  const { data: drafts } = useSuspenseQuery(draftsOptions(ids.activityId))
  const labels = labelsFromDrafts(drafts ?? [])
  return (
    <div className="@container flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">{m.ai_grading_consistency_title()}</h1>
      <ConsistencyBlock
        id="ai-grading-pairs"
        title={m.ai_grading_pairs_title()}
        hint={m.ai_grading_pairs_hint()}
        count={report.pairs.length}
        empty={m.ai_grading_pairs_empty()}
      >
        <DataTable
          label={m.ai_grading_pairs_title()}
          rows={report.pairs}
          columns={pairColumns(ids, labels)}
          getKey={row => `${row.part_key}:${row.a.subject_id}:${row.b.subject_id}`}
        />
      </ConsistencyBlock>
      <ConsistencyBlock
        id="ai-grading-disagreements"
        title={m.ai_grading_disagreements_title()}
        hint={m.ai_grading_disagreements_hint()}
        count={report.disagreements.length}
        empty={m.ai_grading_disagreements_empty()}
      >
        <DataTable
          label={m.ai_grading_disagreements_title()}
          rows={report.disagreements}
          columns={disagreementColumns(ids)}
          getKey={row => row.draft_id}
        />
      </ConsistencyBlock>
      <ConsistencyBlock
        id="ai-grading-drift"
        title={m.ai_grading_drift_title()}
        hint={m.ai_grading_drift_hint()}
        count={report.drift.length}
        empty={m.ai_grading_drift_empty()}
      >
        <DataTable
          label={m.ai_grading_drift_title()}
          rows={report.drift}
          columns={driftColumns(labels)}
          getKey={row => `${row.part_key}:${row.criterion_key}`}
        />
      </ConsistencyBlock>
    </div>
  )
}
