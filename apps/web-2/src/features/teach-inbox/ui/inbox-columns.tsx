import { m } from '#/paraglide/messages'
import type { WorkItem } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import type { StatusTone } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'

import { type InboxKind, isInboxKind } from '../model/inbox'
import { WorkActionLink } from './work-action-link'

export const kindMeta = {
  sla_breach: { label: m.inbox_kind_sla_breach, tone: 'destructive' },
  needs_grading: { label: m.inbox_kind_needs_grading, tone: 'warning' },
  awaiting_release: { label: m.inbox_kind_awaiting_release, tone: 'info' },
} satisfies Record<InboxKind, { label: () => string; tone: StatusTone }>

const inks = {
  neutral: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  destructive: 'text-destructive',
} satisfies Record<StatusTone, string>

/** The state in its tone and words: in a queue of dozens, a column of pills read as one alarm (DESIGN 9). */
function KindText({ kind }: { kind: string }) {
  const meta = isInboxKind(kind) ? kindMeta[kind] : { label: m.inbox_kind_other, tone: 'neutral' as const }
  return <span className={inks[meta.tone]}>{meta.label()}</span>
}

// With the time: the queue is sorted by how long a work waits, and several from one day read as a tie without it.
const date = (unix: number | null) =>
  unix === null ? null : <span className="tabular-nums">{formatDateTime(unix)}</span>

export const inboxColumns: DataColumn<WorkItem>[] = [
  {
    id: 'activity',
    header: m.inbox_col_activity(),
    headerCell: `${m.inbox_col_activity()} · ${m.inbox_col_course()}`,
    priority: 1,
    // The course under what was handed in: one cell, so long course names do not crowd the row.
    cell: item => (
      <span className="flex flex-col">
        <span className="font-medium wrap-anywhere">{item.activity_title}</span>
        <span className="font-sans text-xs font-normal wrap-anywhere text-muted-foreground">{item.course_title}</span>
      </span>
    ),
  },
  {
    id: 'learner',
    header: m.inbox_col_learner(),
    priority: 1,
    // The @username under the name tells namesakes apart (as in the gradebook).
    cell: item => (
      <span className="flex flex-col">
        <span className="wrap-anywhere">{item.learner_name}</span>
        {item.learner_username ? (
          <span className="text-xs wrap-anywhere text-muted-foreground">@{item.learner_username}</span>
        ) : null}
      </span>
    ),
  },
  { id: 'state', header: m.inbox_state(), priority: 2, cell: item => <KindText kind={item.kind} /> },
  { id: 'since', header: m.inbox_col_since(), priority: 2, cell: item => date(item.created_at_unix) },
  { id: 'due', header: m.inbox_col_due(), priority: 3, cell: item => date(item.due_at_unix) },
  {
    id: 'action',
    header: m.inbox_col_action(),
    headerCell: <span className="sr-only">{m.inbox_col_action()}</span>,
    priority: 2,
    action: true,
    stretch: true,
    cell: item => <WorkActionLink item={item} />,
  },
]
