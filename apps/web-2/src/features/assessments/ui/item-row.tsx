import { GripVertical } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { Link } from '#/shared/components/link'
import { formatNumber } from '#/shared/i18n/format'
import { SortableHandle, SortableItem } from '#/shared/ui/sortable'

import { itemKindOf } from '../model/items'
import { ItemSource } from './item-source'
import { kindLabels } from './labels'

type ItemRowProps = {
  courseId: string
  activityId: string
  item: AssessmentItem
  open: boolean
  movable: boolean
}

/**
 * One question in the list: number, title, kind and points; sortable by its handle. The whole row opens the question
 * (the title's link stretches over it), the open one is a tinted row, as the current item of a contents list.
 */
export function ItemRow({ courseId, activityId, item, open, movable }: ItemRowProps) {
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
    // While it moves, the row stays where it would land, faded; its copy follows the pointer.
    <SortableItem
      value={item.id}
      className={`group/row relative flex items-start gap-2.5 rounded-md py-2 pr-1 pl-2 transition-colors duration-100 data-moving:opacity-60 ${open ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
    >
      {/* Three digits wide and set to the right: 9, 10 and 150 end on one line, the titles start on one. */}
      <span aria-hidden className="w-[3ch] shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {item.position}
      </span>
      <div ref={body} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          to="/teach/courses/$courseId/activities/$activityId/edit"
          params={{ courseId, activityId }}
          search={{ item: item.id }}
          aria-current={open ? 'true' : undefined}
          variant="stretched"
        >
          {/* A long prompt-as-title stays two lines in the list; the editor shows it whole. */}
          <span className={`line-clamp-2 text-sm wrap-anywhere ${open ? 'font-medium' : ''}`}>
            <span className="sr-only">{item.position}. </span>
            {title}
          </span>
        </Link>
        <span className="text-xs text-muted-foreground tabular-nums">
          {kindLabels[itemKindOf(item)]()} · {m.assessments_item_points({ points: formatNumber(item.max_score) })}
          {item.metadata.draw_group ? ` · ${m.assessments_item_draw_group({ group: item.metadata.draw_group })}` : null}
        </span>
        <ItemSource source={item.source} className="text-xs text-muted-foreground" />
      </div>
      {movable ? (
        <div className="relative z-1 touch-none transition-opacity duration-100 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:focus-within:opacity-100 [&_button]:size-7">
          <SortableHandle
            render={<IconButton label={m.assessments_item_drag({ title })} icon={<GripVertical aria-hidden />} />}
          />
        </div>
      ) : null}
    </SortableItem>
  )
}
