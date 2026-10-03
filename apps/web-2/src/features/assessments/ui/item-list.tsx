import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { move } from '@dnd-kit/helpers'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { formatNumber } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'

import { inOrder, totalPoints } from '../model/items'
import { can } from '../model/route'
import { placeItems, reorderItemsOptions } from '../queries'
import { AddItemMenu } from './add-item-menu'
import { ItemRow } from './item-row'

type ItemListProps = { courseId: string; activityId: string; assessment: AssessmentDetail; openId: string | undefined }

/**
 * The questions in order, with the count and the sum of points. A drop puts the new order into the cache and sends
 * it; a refusal puts the server's order back.
 */
export function ItemList({ courseId, activityId, assessment, openId }: ItemListProps) {
  const queryClient = useQueryClient()
  const reorder = useMutation(reorderItemsOptions(queryClient, activityId))
  const editable = can(assessment, 'update')
  const { items } = assessment
  const drop = (event: DragEndEvent) => {
    if (event.canceled) return
    const before = items.map(item => item.id)
    const after = move(before, event)
    if (after.every((id, at) => id === before[at])) return
    placeItems(queryClient, activityId, inOrder(items, after))
    reorder.mutate(
      { path: { assessment_id: assessment.id }, body: { items: after } },
      { onError: () => placeItems(queryClient, activityId, items) },
    )
  }
  return (
    <section aria-label={m.assessments_items_label()} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {m.assessments_items_summary({
            count: formatNumber(items.length),
            points: formatNumber(totalPoints(items)),
          })}
        </p>
        {editable ? <AddItemMenu activityId={activityId} assessment={assessment} /> : null}
      </div>
      {reorder.error ? <ErrorAlert>{presentError(reorder.error)}</ErrorAlert> : null}
      {items.length === 0 ? (
        <div className="flex flex-col gap-1 py-6">
          <p className="font-medium">{m.assessments_items_empty()}</p>
          {editable ? <p className="text-sm text-muted-foreground">{m.assessments_items_empty_hint()}</p> : null}
        </div>
      ) : (
        <DragDropProvider onDragEnd={drop}>
          <ol className="flex flex-col gap-2">
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
    </section>
  )
}
