import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'

import type { Work } from '../queries'
import { usePile } from './use-pile'

/** Where in the pile: only when the whole queue is loaded, else the total is not known here. */
export function ReviewPosition({ work, className }: { work: Work; className?: string }) {
  const { params, ids, hasNextPage } = usePile(work)
  const at = ids.indexOf(params.submissionId)
  if (at < 0 || hasNextPage || ids.length <= 1) return null
  return (
    <span className={`text-sm text-muted-foreground tabular-nums ${className ?? ''}`}>
      {m.grading_position({ at: formatNumber(at + 1), total: formatNumber(ids.length) })}
    </span>
  )
}
