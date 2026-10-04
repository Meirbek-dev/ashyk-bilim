import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'

import { openItem } from '../model/items'
import { assessmentOptions } from '../queries'
import { ItemEditor } from './item-editor'
import { ItemList } from './item-list'
import { lockReason } from './labels'

const EDIT = '/_authed/teach/courses/$courseId_/activities/$activityId/edit'

/** `edit` of a quiz, exam or code challenge: the question list beside the open question's editor. */
export function AssessmentEditPage() {
  const { courseId, activityId } = useParams({ from: EDIT })
  const { item: itemId } = useSearch({ from: EDIT })
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activityId))
  const open = openItem(assessment.items, itemId)
  const lock = lockReason(assessment)
  return (
    <div className="@container flex flex-col gap-gutter">
      {lock ? <p className="text-sm text-muted-foreground">{lock}</p> : null}
      <div className="grid gap-gutter @3xl:grid-cols-3">
        <ItemList courseId={courseId} activityId={activityId} assessment={assessment} openId={open?.id} />
        <div className="min-w-0 @3xl:col-span-2">
          {open ? <ItemEditor key={open.id} activityId={activityId} assessment={assessment} item={open} /> : null}
        </div>
      </div>
    </div>
  )
}
