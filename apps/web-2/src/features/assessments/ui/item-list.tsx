import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { move } from '@dnd-kit/helpers'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { EmptyState } from '#/shared/components/empty-state'
import { ErrorAlert } from '#/shared/components/error-alert'
import { formatNumber } from '#/shared/i18n/format'
import { accessibleDrag } from '#/shared/lib/drag-accessibility'
import { presentError } from '#/shared/i18n/errors'

import { inOrder, totalPoints } from '../model/items'
import { can } from '../model/route'
import { placeItems, reorderItemsOptions } from '../queries'
import { AddItemMenu } from './add-item-menu'
import { ItemRow } from './item-row'
import { useVersion } from './use-version'

type ItemListProps = { courseId: string; activityId: string; assessment: AssessmentDetail; openId: string | undefined }

/**
 * The questions in order, with the count and the sum of points. A drop puts the new order into the cache and sends
 * it; a refusal puts the server's order back.
 */
export function ItemList({ courseId, activityId, assessment, openId }: ItemListProps) {
  const queryClient = useQueryClient()
  const reorder = useMutation(reorderItemsOptions(queryClient, activityId))
  const editable = can(assessment, 'edit')
  const version = useVersion(activityId)
  const { items } = assessment
  const plugins = accessibleDrag(id => {
    const item = items.find(entry => entry.id === id)
    return item && `${item.position}. ${item.title || m.assessments_item_untitled()}`
  })
  const drop = (event: DragEndEvent) => {
    if (event.canceled) return
    const before = items.map(item => item.id)
    const after = move(before, event)
    if (after.every((id, at) => id === before[at])) return
    placeItems(queryClient, activityId, inOrder(items, after))
    reorder.mutate(
      { path: { assessment_id: assessment.id }, body: { items: after }, headers: version.headers() },
      { onError: () => placeItems(queryClient, activityId, items) },
    )
  }
  return (
    <section
      aria-label={m.assessments_items_label()}
      className="flex min-w-0 flex-col gap-3 @3xl:sticky @3xl:top-18 @3xl:max-h-[calc(100dvh-5.5rem)] @3xl:self-start"
    >
      <p className="border-b pb-3 text-sm text-muted-foreground tabular-nums">
        {m.assessments_items_summary({
          count: formatNumber(items.length),
          points: formatNumber(totalPoints(items)),
        })}
      </p>
      {reorder.error ? <ErrorAlert>{presentError(reorder.error)}</ErrorAlert> : null}
      {items.length === 0 ? (
        <EmptyState>
          {m.assessments_items_empty()}
          {editable ? `. ${m.assessments_items_empty_hint()}` : null}
        </EmptyState>
      ) : (
        <DragDropProvider plugins={plugins} onDragEnd={drop}>
          {/* An exam holds 150 questions: the list scrolls by itself, so the open question stays one look away. */}
          <ol className="-mx-2 flex max-h-80 min-h-0 flex-col gap-px overflow-y-auto @3xl:max-h-none @3xl:flex-1">
            {items.map((item, index) => (
              <ItemRow
                key={item.id}
                courseId={courseId}
                activityId={activityId}
                item={item}
                index={index}
                open={item.id === openId}
                movable={editable}
              />
            ))}
          </ol>
        </DragDropProvider>
      )}
      {/* Under the list, where the new question lands; outside the scroller, so it is in reach at question 150 too. */}
      {editable ? (
        <div className={items.length > 0 ? 'border-t pt-3' : undefined}>
          <AddItemMenu activityId={activityId} assessment={assessment} />
        </div>
      ) : null}
    </section>
  )
}
