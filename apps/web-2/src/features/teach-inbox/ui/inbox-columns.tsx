import { m } from '#/paraglide/messages'
import type { WorkItem } from '#/shared/api/gen/types.gen'
import type { DataColumn } from '#/shared/components/data-columns'
import { StatusBadge, type StatusTone } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'

import { type InboxKind, isInboxKind } from '../model/inbox'
import { WorkActionLink } from './work-action-link'

export const kindMeta = {
  sla_breach: { label: m.inbox_kind_sla_breach, tone: 'destructive' },
  needs_grading: { label: m.inbox_kind_needs_grading, tone: 'warning' },
  awaiting_release: { label: m.inbox_kind_awaiting_release, tone: 'info' },
} satisfies Record<InboxKind, { label: () => string; tone: StatusTone }>

function KindBadge({ kind }: { kind: string }) {
  const meta = isInboxKind(kind) ? kindMeta[kind] : { label: m.inbox_kind_other, tone: 'neutral' as const }
  return <StatusBadge tone={meta.tone}>{meta.label()}</StatusBadge>
}

const date = (unix: number | null) => (unix === null ? null : <span className="tabular-nums">{formatDate(unix)}</span>)

export const inboxColumns: DataColumn<WorkItem>[] = [
  {
    id: 'activity',
    header: m.inbox_col_activity(),
    priority: 1,
    cell: item => <span className="wrap-anywhere">{item.activity_title}</span>,
  },
  {
    id: 'course',
    header: m.inbox_col_course(),
    priority: 2,
    cell: item => <span className="wrap-anywhere">{item.course_title}</span>,
  },
  { id: 'state', header: m.inbox_state(), priority: 2, cell: item => <KindBadge kind={item.kind} /> },
  { id: 'since', header: m.inbox_col_since(), priority: 2, cell: item => date(item.created_at_unix) },
  { id: 'due', header: m.inbox_col_due(), priority: 3, cell: item => date(item.due_at_unix) },
  { id: 'action', header: m.inbox_col_action(), priority: 2, cell: item => <WorkActionLink item={item} /> },
]
