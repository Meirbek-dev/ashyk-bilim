import type { ImportIssue } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { issueAnchor, issueLine } from '../model/issues'
import { SeverityIcon } from './severity-icon'

/** Brings the question card (or the settings) of an issue into view and moves focus there. */
function reveal(anchor: string) {
  const target = document.getElementById(anchor)
  target?.scrollIntoView({ block: 'start' })
  target?.focus({ preventScroll: true })
}

/** One issue as DOT writes it (`{sheet} → {cell}: {text}`); a located one shows its question on click. */
export function IssueRow({ issue, sheet }: { issue: ImportIssue; sheet: string }) {
  const anchor = issueAnchor(issue)
  const line = issueLine(issue, sheet)
  return (
    <li className="flex items-start gap-2 text-sm">
      <SeverityIcon severity={issue.severity} />
      {anchor ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => reveal(anchor)}
          className="-my-0.5 h-auto min-w-0 justify-start px-1 py-0.5 text-left font-normal wrap-anywhere whitespace-normal"
        >
          {line}
        </Button>
      ) : (
        <span className="min-w-0 wrap-anywhere">{line}</span>
      )}
    </li>
  )
}
