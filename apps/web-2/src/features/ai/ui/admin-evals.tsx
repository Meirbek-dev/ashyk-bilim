import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { EvalResult } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { formatDate, formatNumber } from '#/shared/i18n/format'
import { vAiRunStatus } from '#/shared/api/gen/valibot.gen'

import { runStatusLabels } from '../model/labels'
import { evalsOptions } from '../queries'

const score = (value: number | null) => (value === null ? '' : formatNumber(Math.round(value * 100) / 100))

const columns = (): DataColumn<EvalResult>[] => [
  { id: 'dataset', header: m.ai_col_dataset(), priority: 1, cell: row => row.dataset },
  { id: 'evaluator', header: m.ai_col_evaluator(), priority: 2, cell: row => row.evaluator },
  { id: 'score', header: m.ai_col_score(), priority: 2, cell: row => score(row.score) },
  {
    id: 'passed',
    header: m.ai_col_passed(),
    priority: 2,
    cell: row => (row.passed === null ? '' : row.passed ? m.ai_yes() : m.ai_no()),
  },
  { id: 'date', header: m.ai_col_started(), priority: 3, cell: row => formatDate(row.created_at_unix) },
]

/** Run counts by status, the eval summary and the recent evals (B-AI-23). */
export function AdminEvals() {
  const { data } = useSuspenseQuery(evalsOptions())
  const { evals, runs } = data
  return (
    <section id="evals" className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.ai_admin_evals()}</h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {vAiRunStatus.options.map(status => (
          <li key={status}>
            {runStatusLabels[status]()}: {formatNumber(runs[status])}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <li>{m.ai_evals_total({ count: formatNumber(evals.total) })}</li>
        <li>{m.ai_evals_passed({ count: formatNumber(evals.passed) })}</li>
        <li>{m.ai_evals_failed({ count: formatNumber(evals.failed) })}</li>
        {evals.average_score === null ? null : <li>{m.ai_evals_average({ score: score(evals.average_score) })}</li>}
      </ul>
      <h3 className="font-medium">{m.ai_evals_recent()}</h3>
      {data.recent_evals.length === 0 ? (
        <p className="text-muted-foreground">{m.ai_evals_empty()}</p>
      ) : (
        <DataTable label={m.ai_evals_recent()} rows={data.recent_evals} columns={columns()} getKey={row => row.id} />
      )}
    </section>
  )
}
