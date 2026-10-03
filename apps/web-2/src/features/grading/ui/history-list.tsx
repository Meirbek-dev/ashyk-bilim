import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { FileGradingEntry, GradingEntry } from '#/shared/api/gen/types.gen'
import { StatusBadge, type StatusTone } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'

import { historyOptions, type Work } from '../queries'
import { scoreText, statusMeta } from './labels'

/**
 * An assessment entry is a draft or published (B-GRD-17); a file attempt's entry carries the status it was saved
 * with (B-GRD-26).
 */
function badge(entry: GradingEntry | FileGradingEntry): { label: string; tone: StatusTone } {
  if ('status' in entry) return { label: statusMeta[entry.status].label(), tone: statusMeta[entry.status].tone }
  return entry.published_at_unix === null
    ? { label: m.grading_history_draft(), tone: 'warning' }
    : { label: m.grading_history_published({ date: formatDateTime(entry.published_at_unix) }), tone: 'success' }
}

/** Every grading entry of the work under review, newest as the server orders them (B-GRD-17, B-GRD-26). */
export function HistoryList({ work, id }: { work: Work; id: string }) {
  const { data: entries } = useSuspenseQuery(historyOptions(work, id))
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{m.grading_history_empty()}</p>
  return (
    <ol className="flex flex-col divide-y text-sm">
      {entries.map(entry => {
        const { label, tone } = badge(entry)
        const feedback = 'status' in entry ? entry.feedback : entry.overall_feedback
        return (
          <li key={entry.id} className="flex flex-col gap-1 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{formatDateTime(entry.created_at_unix)}</span>
              <span className="font-medium tabular-nums">{scoreText(entry.final_score ?? entry.raw_score)}</span>
              {entry.penalty_pct > 0 ? (
                <span className="text-muted-foreground">
                  {m.grading_penalty({ percent: scoreText(entry.penalty_pct) })}
                </span>
              ) : null}
              <StatusBadge tone={tone}>{label}</StatusBadge>
            </div>
            {feedback ? <p className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">{feedback}</p> : null}
          </li>
        )
      })}
    </ol>
  )
}
