import { m } from '#/paraglide/messages'
import type { ImportIssue, PlannedItem } from '#/shared/api/gen/types.gen'
import { importMediaUrl, ItemMedia } from '#/shared/components/item-media'
import { cn } from '#/shared/lib/utils'

import { issueText, rowAnchor } from '../model/issues'
import { dotType, type DotType } from '../model/preview'
import { AnswerView, LITERAL } from './answer-view'
import { SeverityIcon } from './severity-icon'

const typeLabels: Record<DotType, () => string> = {
  single: m.assessment_import_type_single,
  multiple: m.assessment_import_type_multiple,
  short: m.assessment_import_type_short,
  matching: m.assessment_import_type_matching,
  essay: m.assessment_import_type_essay,
}

type QuestionCardProps = {
  importId: string
  row: number
  /** None: a row the server could not read as a question; only its issues are shown. */
  item: PlannedItem | undefined
  issues: readonly ImportIssue[] | undefined
}

/** One question of the file as it will be created, with the problems found in its row. */
export function QuestionCard({ importId, row, item, issues }: QuestionCardProps) {
  const src = (uploadId: string) => importMediaUrl(importId, uploadId)
  const body = item?.body
  const failed = issues?.some(issue => issue.severity === 'error')
  const meta = [
    m.assessment_import_row({ row: String(row) }),
    item ? typeLabels[dotType(item)]() : null,
    item?.draw_group ? m.assessment_import_level({ level: item.draw_group }) : null,
  ].filter(Boolean)
  return (
    // Laid out lazily by the browser (a file holds up to 1000 questions); the target of the issues panel's links.
    <li
      id={rowAnchor(row)}
      tabIndex={-1}
      className={cn(
        'flex scroll-mt-16 flex-col gap-3 rounded-xl border bg-card p-4 [contain-intrinsic-size:auto_12rem] [content-visibility:auto]',
        failed && 'border-destructive',
      )}
    >
      <p className="text-sm text-muted-foreground">{meta.join(' · ')}</p>
      {body?.prompt ? <p className={LITERAL}>{body.prompt}</p> : null}
      {body && 'media' in body ? <ItemMedia media={body.media} src={src} /> : null}
      {body ? <AnswerView body={body} src={src} /> : null}
      {issues?.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {issues.map((issue, at) => (
            <li key={`${issue.code}-${issue.cell ?? ''}-${at}`} className="flex items-start gap-2">
              <SeverityIcon severity={issue.severity} />
              <span className="min-w-0 wrap-anywhere">
                {issue.cell ? `${issue.cell}: ` : ''}
                {issueText(issue)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
