import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'

import { historyOptions } from '../queries'
import { scoreText } from './labels'

/** Every grading entry of the submission, newest as the server orders them (B-GRD-17). */
export function HistoryList({ submissionId }: { submissionId: string }) {
  const { data: entries } = useSuspenseQuery(historyOptions(submissionId))
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{m.grading_history_empty()}</p>
  return (
    <ol className="flex flex-col divide-y text-sm">
      {entries.map(entry => (
        <li key={entry.id} className="flex flex-col gap-1 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{formatDateTime(entry.created_at_unix)}</span>
            <span className="font-medium tabular-nums">{scoreText(entry.final_score ?? entry.raw_score)}</span>
            {entry.penalty_pct > 0 ? (
              <span className="text-muted-foreground">
                {m.grading_penalty({ percent: scoreText(entry.penalty_pct) })}
              </span>
            ) : null}
            {entry.published_at_unix === null ? (
              <StatusBadge tone="warning">{m.grading_history_draft()}</StatusBadge>
            ) : (
              <StatusBadge tone="success">
                {m.grading_history_published({ date: formatDateTime(entry.published_at_unix) })}
              </StatusBadge>
            )}
          </div>
          {entry.overall_feedback ? (
            <p className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">{entry.overall_feedback}</p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
