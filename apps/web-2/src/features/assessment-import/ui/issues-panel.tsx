import { Copy } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentImport } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'

import { bySeverity, issuesReport, SEVERITIES } from '../model/issues'
import { IssueRow } from './issue-row'
import { severityLabels } from './severity-icon'

type IssuesPanelProps = { imported: Pick<AssessmentImport, 'issues' | 'issues_truncated' | 'sheet'> }

/**
 * Errors, then warnings, then notes, each located by its cell as DOT does; a click shows the question. «Скопировать
 * список» puts the lines on the clipboard, to fix the file beside the page. The counts are a status: a re-read
 * (the `\n` switch) announces what changed.
 */
export function IssuesPanel({ imported }: IssuesPanelProps) {
  const [copied, setCopied] = useState(false)
  const groups = bySeverity(imported.issues)
  const present = SEVERITIES.filter(severity => groups[severity].length > 0)
  const copy = async () => {
    await navigator.clipboard.writeText(issuesReport(imported))
    setCopied(true)
  }
  return (
    <section aria-labelledby="import-issues-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="import-issues-title" className="text-lg font-semibold">
          {m.assessment_import_issues_title()}
        </h2>
        <div className="flex items-center gap-2">
          {copied ? <span className="text-sm text-muted-foreground">{m.assessment_import_copied()}</span> : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void copy().catch(() => setCopied(false))}>
            <Copy aria-hidden data-icon="inline-start" />
            {m.assessment_import_copy()}
          </Button>
        </div>
      </div>
      <output className="text-sm">
        {present.map(severity => `${severityLabels[severity]()}: ${formatNumber(groups[severity].length)}`).join(' · ')}
        {groups.error.length > 0 ? (
          <span className="block text-destructive">{m.assessment_import_errors_hint()}</span>
        ) : null}
      </output>
      {present.map(severity => (
        <div key={severity} className="flex flex-col gap-2">
          <h3 className="font-medium">{severityLabels[severity]()}</h3>
          <ul className="flex flex-col gap-1.5">
            {groups[severity].map((issue, at) => (
              <IssueRow key={`${issue.code}-${issue.cell ?? ''}-${at}`} issue={issue} sheet={imported.sheet} />
            ))}
          </ul>
        </div>
      ))}
      {imported.issues_truncated > 0 ? (
        <p className="text-sm text-muted-foreground">
          {m.assessment_import_truncated({ count: formatNumber(imported.issues_truncated) })}
        </p>
      ) : null}
    </section>
  )
}
