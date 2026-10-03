import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import type { QueueRow } from '../model/queue'
import type { Work } from '../queries'
import { ExtendDeadline } from './extend-deadline'
import { ReturnSelected } from './return-selected'

type SelectionBarProps = { work: Work; courseId: CourseId; rows: readonly QueueRow[]; onDone: () => void }

/** What can be done to the selected rows: return them (B-GRD-08) and extend their deadline (B-GRD-09, B-GRD-25). */
export function SelectionBar({ work, courseId, rows, onDone }: SelectionBarProps) {
  if (rows.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm tabular-nums">{m.grading_selected({ count: formatNumber(rows.length) })}</p>
      <ReturnSelected work={work} courseId={courseId} rows={rows} onDone={onDone} />
      <ExtendDeadline work={work} courseId={courseId} rows={rows} />
    </div>
  )
}
