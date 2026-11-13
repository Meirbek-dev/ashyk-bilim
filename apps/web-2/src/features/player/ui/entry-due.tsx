import { m } from '#/paraglide/messages'
import { formatDateTime } from '#/shared/i18n/format'

import { valueLine } from '../model/value-line'

/** The deadline as the entry card's foot: the words left, the date right, under a hairline. */
export function EntryDue({ dueAtUnix }: { dueAtUnix: number }) {
  const date = formatDateTime(dueAtUnix)
  const due = valueLine(m.player_due({ date }), date)
  return (
    <p className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-4 text-sm">
      <span className="text-muted-foreground">{due.label}</span>
      {due.value ? <span className="tabular-nums">{due.value}</span> : null}
    </p>
  )
}
