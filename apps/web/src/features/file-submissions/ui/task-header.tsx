import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime, formatNumber, formatPercent } from '#/shared/i18n/format'
import { Skeleton } from '#/shared/ui/skeleton'

import { lateRule, pastDue, type LateRule } from '../model/task'
import { describeTypes } from '../model/types'
import { typeGroupLabels } from './labels'

const lateText = (rule: LateRule): string => {
  if (rule.kind === 'closed') return m.submission_late_closed()
  if (rule.kind === 'free') return m.submission_late_free()
  if (rule.kind === 'penalty')
    return m.submission_late_penalty({ percent: formatPercent(rule.percent), days: formatNumber(rule.days) })
  return m.submission_late_cutoff({ date: formatDateTime(rule.at) })
}

/** Group names, then the raw types outside every group (legacy data); none means any type. */
const typeNames = (mimes: readonly string[]): string[] => {
  const { groups, other } = describeTypes(mimes)
  return [...groups.map(group => typeGroupLabels[group]()), ...other]
}

/** The task as the learner reads it (B-FSB-03): deadline and late rule, instructions, what may be attached. */
export function TaskHeader({ task, now }: { task: FileSubmission; now: number }) {
  const rule = lateRule(task)
  const types = typeNames(task.allowed_mime_types)
  return (
    <>
      {task.due_at_unix === null ? null : (
        <div className="flex flex-col gap-1 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.submission_due({ date: formatDateTime(task.due_at_unix) })}</span>
            {pastDue(task, now) ? <StatusBadge tone="warning">{m.submission_past_due()}</StatusBadge> : null}
          </p>
          {rule ? <p className="text-muted-foreground">{lateText(rule)}</p> : null}
        </div>
      )}
      <section aria-labelledby="submission-instructions" className="flex flex-col gap-2">
        <h2 id="submission-instructions" className="text-xl font-semibold">
          {m.submission_instructions()}
        </h2>
        <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
          <MarkdownView content={task.instructions} />
        </Suspense>
      </section>
      <section aria-labelledby="submission-requirements" className="flex flex-col gap-2">
        <h2 id="submission-requirements" className="text-xl font-semibold">
          {m.submission_requirements()}
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{m.submission_max_files({ count: task.max_files })}</li>
          {task.max_file_size_mb === null ? null : <li>{m.submission_max_size({ mb: task.max_file_size_mb })}</li>}
          {types.length === 0 ? (
            <li>{m.submission_types_any()}</li>
          ) : (
            <li>
              <span className="inline-flex flex-wrap items-center gap-1">
                <span className="mr-1">{m.submission_field_types()}</span>
                {types.map(name => (
                  <StatusBadge key={name} tone="neutral">
                    {name}
                  </StatusBadge>
                ))}
              </span>
            </li>
          )}
        </ul>
      </section>
    </>
  )
}
