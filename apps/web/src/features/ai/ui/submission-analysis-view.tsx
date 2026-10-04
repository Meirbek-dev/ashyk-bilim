import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { SubmissionAnalysis } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'

import { levelLabels } from '../model/labels'
import { Citations } from './citations'

/** The typed `SubmissionAnalysis.analysis` (B-AI-16): summary, knowledge gaps with severity, the next step. */
export function SubmissionAnalysisView({ analysis }: { analysis: SubmissionAnalysis }) {
  const report = analysis.analysis
  return (
    <article className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{formatDate(analysis.created_at_unix)}</p>
      <MarkdownView content={report.summary} />
      {report.knowledge_gaps && report.knowledge_gaps.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{m.ai_gaps()}</h4>
          <ul className="flex flex-col gap-2">
            {report.knowledge_gaps.map(gap => (
              <li key={gap.concept} className="flex flex-col gap-1 rounded-md border p-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  {gap.severity ? <StatusBadge tone="warning">{levelLabels[gap.severity]()}</StatusBadge> : null}
                  <span className="font-medium wrap-anywhere">{gap.concept}</span>
                </span>
                {gap.evidence ? <span className="text-muted-foreground">{gap.evidence}</span> : null}
                {gap.remediation_goal ? <span>{gap.remediation_goal}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.next_action ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">{m.ai_next_action()}</h4>
          <p className="text-sm">{report.next_action}</p>
        </section>
      ) : null}
      <Citations citations={report.citations ?? []} />
    </article>
  )
}
