import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AiRunId, RunEventPayload } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'

import { readableExcerpt } from '../model/ai'
import { eventLabel, kindLabels, runErrorText, runStatusLabels } from '../model/labels'
import { runDetailOptions } from '../queries'

/** What a journal step adds: the number of sources collected or of input tokens counted. */
const eventDetail = (payload: RunEventPayload): string =>
  [
    payload.source_count === undefined ? '' : m.ai_event_sources({ count: formatNumber(payload.source_count) }),
    payload.input_tokens === undefined ? '' : m.ai_event_tokens({ count: formatNumber(payload.input_tokens) }),
  ]
    .filter(Boolean)
    .join(' · ')

/** One run (B-AI-22): its numbers, the event journal in order, artifacts and evidence. */
export function AdminRunDetail({ runId }: { runId: AiRunId }) {
  const { data } = useSuspenseQuery(runDetailOptions(runId))
  const { run } = data
  return (
    // In line with the panel's title; each section opens on a hairline.
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-lg font-semibold">{kindLabels[run.feature]()}</span>
          {run.status === 'failed' ? (
            <StatusBadge tone="destructive">{runStatusLabels[run.status]()}</StatusBadge>
          ) : (
            <span className="text-muted-foreground">{runStatusLabels[run.status]()}</span>
          )}
          {run.stuck ? <StatusBadge tone="warning">{m.ai_stuck()}</StatusBadge> : null}
        </div>
        <ul className="flex flex-col gap-0.5 text-muted-foreground tabular-nums">
          <li>{formatDateTime(run.started_at_unix)}</li>
          {run.course_name ? <li className="wrap-anywhere">{m.ai_run_course({ course: run.course_name })}</li> : null}
          {run.model_name ? <li className="wrap-anywhere">{m.ai_model({ model: run.model_name })}</li> : null}
          <li>
            {m.ai_run_tokens({
              input: formatNumber(run.input_tokens ?? 0),
              output: formatNumber(run.output_tokens ?? 0),
            })}
          </li>
          {run.duration_ms === null ? null : (
            <li>{m.ai_run_duration({ seconds: formatNumber(Math.round(run.duration_ms / 100) / 10) })}</li>
          )}
          {run.error_code ? (
            <li className="text-destructive">
              {m.ai_run_error_text({ text: runErrorText(run.error_code), code: run.error_code })}
            </li>
          ) : null}
        </ul>
      </div>
      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="font-medium">{m.ai_run_events()}</h3>
        {/* A journal with hanging numerals: the steps in one column, what each added at the line's end. */}
        <ol className="flex flex-col gap-1">
          {data.events.map(event => (
            <li key={event.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-1">
              <span className="text-muted-foreground tabular-nums">{event.sequence}</span>
              <span className="flex flex-wrap justify-between gap-x-3">
                <span>{eventLabel(event.event_type)}</span>
                <span className="text-muted-foreground tabular-nums">{eventDetail(event.payload)}</span>
                {event.payload.error_code ? <span className="text-destructive">{event.payload.error_code}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="font-medium">{m.ai_run_artifacts()}</h3>
        <ul className="flex flex-col gap-1">
          {data.artifacts.map(artifact => (
            <li key={artifact.id} className="tabular-nums">
              {kindLabels[artifact.kind]()} · {formatDateTime(artifact.created_at_unix)}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="font-medium">{m.ai_run_evidence()}</h3>
        <ul className="flex flex-col gap-1">
          {data.evidence.map(item => (
            <li key={item.id} className="wrap-anywhere">
              {/* A quote in machine form (an activity's settings as JSON) is noise beside its label (B-AI-31). */}
              <span>{item.label}</span> <span className="text-muted-foreground">{readableExcerpt(item.excerpt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
