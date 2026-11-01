import { m } from '#/paraglide/messages'
import type { DisagreementView, DriftView, SimilarPairView, WorkRef } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { Link } from '#/shared/components/link'
import { formatNumber, formatPercent } from '#/shared/i18n/format'

import { disagreementGap, driftPoints, type Labels } from '../model/consistency'
import { oneDecimal } from '../model/metrics'

// The three tables of an activity's consistency page (B-AIG-06..08).

const REVIEW = '/teach/courses/$courseId/activities/$activityId/submissions/$submissionId'

type Ids = { courseId: string; activityId: string }

const points = (value: number) => m.ai_grading_points({ value: formatNumber(oneDecimal(value), { signed: true }) })
const percent = (value: number) => formatPercent(oneDecimal(value))
const partText = (labels: Labels, key: string) => labels.part(key) ?? m.ai_grading_part_whole()

/** A work of a pair: the learner's name leads into its review, with its score. */
function Work({ ids, work }: { ids: Ids; work: WorkRef }) {
  return (
    <span className="flex flex-col">
      <Link to={REVIEW} params={{ ...ids, submissionId: work.subject_id }} search={{}} variant="text">
        {work.learner_name}
      </Link>
      <span className="text-xs text-muted-foreground tabular-nums">{percent(work.score_pct)}</span>
    </span>
  )
}

export const pairColumns = (ids: Ids, labels: Labels): DataColumn<SimilarPairView>[] => [
  { id: 'part', header: m.ai_grading_col_part(), priority: 1, wrap: true, cell: row => partText(labels, row.part_key) },
  { id: 'a', header: m.ai_grading_col_work_a(), priority: 2, cell: row => <Work ids={ids} work={row.a} /> },
  { id: 'b', header: m.ai_grading_col_work_b(), priority: 2, cell: row => <Work ids={ids} work={row.b} /> },
  {
    id: 'similarity',
    header: m.ai_grading_col_similarity(),
    priority: 2,
    cell: row => <span className="tabular-nums">{percent(row.similarity * 100)}</span>,
  },
  {
    id: 'gap',
    header: m.ai_grading_col_gap(),
    priority: 2,
    cell: row => (
      <span className="tabular-nums">{m.ai_grading_points({ value: formatNumber(oneDecimal(row.gap)) })}</span>
    ),
  },
]

export const disagreementColumns = (ids: Ids): DataColumn<DisagreementView>[] => [
  {
    id: 'learner',
    header: m.ai_grading_col_learner(),
    priority: 1,
    cell: row => (
      <Link to={REVIEW} params={{ ...ids, submissionId: row.subject_id }} search={{}} variant="text">
        {row.learner_name}
      </Link>
    ),
  },
  {
    id: 'scores',
    header: m.ai_grading_col_scores(),
    priority: 2,
    cell: row => (
      <span className="tabular-nums">
        {m.ai_grading_scores({ ai: percent(row.ai_score), teacher: percent(row.final_score) })}
      </span>
    ),
  },
  {
    id: 'gap',
    header: m.ai_grading_col_gap(),
    priority: 2,
    cell: row => <span className="tabular-nums">{points(disagreementGap(row))}</span>,
  },
]

export const driftColumns = (labels: Labels): DataColumn<DriftView>[] => [
  {
    id: 'criterion',
    header: m.ai_grading_col_criterion(),
    priority: 1,
    wrap: true,
    cell: row => labels.criterion(row.part_key, row.criterion_key) ?? row.criterion_key,
  },
  { id: 'part', header: m.ai_grading_col_part(), priority: 2, wrap: true, cell: row => partText(labels, row.part_key) },
  {
    id: 'offset',
    header: m.ai_grading_col_drift(),
    priority: 2,
    cell: row => {
      const value = driftPoints(row.offset)
      if (value === 0) return m.ai_grading_drift_none()
      const amount = m.ai_grading_points({ value: formatNumber(Math.abs(value)) })
      return value < 0 ? m.ai_grading_drift_higher({ amount }) : m.ai_grading_drift_lower({ amount })
    },
  },
  {
    id: 'corrections',
    header: m.ai_grading_col_corrections(),
    priority: 2,
    cell: row => <span className="tabular-nums">{formatNumber(row.corrections)}</span>,
  },
]
