import { useSortable } from '@dnd-kit/react/sortable'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { Link } from '#/shared/components/link'
import { formatNumber } from '#/shared/i18n/format'

import { itemKindOf } from '../model/items'
import { ItemSource } from './item-source'
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
  const body = useRef<HTMLDivElement>(null)
  // The list scrolls by itself: the open question is in sight, also when a link opened one far down.
  useEffect(() => {
    const list = body.current?.closest('ol')
    if (!open || !body.current || !list) return
    const row = body.current.getBoundingClientRect()
    const box = list.getBoundingClientRect()
    if (row.top < box.top || row.bottom > box.bottom) list.scrollTop += row.top - box.top - 8
  }, [open])
  return (
    // Without `move` the row is not a sortable at all: dnd-kit would make the row itself a button.
    <li
      ref={movable ? ref : undefined}
      className={`group/row relative flex items-start gap-1 py-2.5 ${open ? 'bg-accent font-medium text-accent-foreground' : ''} ${isDragging ? 'opacity-60' : ''}`}
    >
      <span aria-hidden className="w-8 shrink-0 ps-3 text-sm text-muted-foreground tabular-nums">
        {item.position}
      </span>
      <div ref={body} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          to="/teach/courses/$courseId/activities/$activityId/edit"
          params={{ courseId, activityId }}
          search={{ item: item.id }}
          aria-current={open ? 'true' : undefined}
          variant="title"
        >
          {/* A long prompt-as-title stays three lines in the list; the editor shows it whole. */}
          <span className="line-clamp-3 text-sm wrap-anywhere">
            <span className="sr-only">{item.position}. </span>
            {title}
          </span>
        </Link>
        <span className="text-xs text-muted-foreground">
          {kindLabels[itemKindOf(item)]()} · {m.assessments_item_points({ points: formatNumber(item.max_score) })}
          {item.metadata.draw_group ? ` · ${m.assessments_item_draw_group({ group: item.metadata.draw_group })}` : null}
        </span>
        <ItemSource source={item.source} className="text-xs text-muted-foreground" />
      </div>
      {movable ? (
        <div className="transition-opacity duration-100 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:focus-within:opacity-100 [&_button]:size-7">
          <IconButton
            ref={handleRef}
            aria-roledescription={m.studio_drag_role()}
            label={m.assessments_item_drag({ title })}
            icon={<GripVertical aria-hidden />}
          />
        </div>
      ) : null}
    </li>
  )
}
