import { useSortable } from '@dnd-kit/react/sortable'
import { GripVertical } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { Link } from '#/shared/components/link'
import { formatNumber } from '#/shared/i18n/format'

import { itemKindOf } from '../model/items'
import { kindLabels } from './labels'

type ItemRowProps = {
  courseId: string
  activityId: string
  item: AssessmentItem
  index: number
  open: boolean
  movable: boolean
}

/** One question in the list: number, title (opens it), kind and points; sortable by its handle. */
export function ItemRow({ courseId, activityId, item, index, open, movable }: ItemRowProps) {
  const { ref, handleRef, isDragging } = useSortable({ id: item.id, index, disabled: !movable })
  const title = item.title || m.assessments_item_untitled()
  return (
    // Without `move` the row is not a sortable at all: dnd-kit would make the row itself a button.
    <li
      ref={movable ? ref : undefined}
      className={`flex items-start gap-2 rounded-lg border p-2 ${open ? 'border-primary bg-accent' : 'bg-card'} ${isDragging ? 'opacity-60' : ''}`}
    >
      {movable ? (
        <IconButton ref={handleRef} label={m.assessments_item_drag({ title })} icon={<GripVertical aria-hidden />} />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <Link
          to="/teach/courses/$courseId/activities/$activityId/edit"
          params={{ courseId, activityId }}
          search={{ item: item.id }}
          aria-current={open ? 'true' : undefined}
        >
          <span className="wrap-anywhere">
            {item.position}. {title}
          </span>
        </Link>
        <span className="text-xs text-muted-foreground">
          {kindLabels[itemKindOf(item)]()} · {m.assessments_item_points({ points: formatNumber(item.max_score) })}
        </span>
      </div>
    </li>
  )
}
