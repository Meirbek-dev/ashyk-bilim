import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'

import { ExcelMenu } from '#/features/assessment-import'

import { openItem } from '../model/items'
import { assessmentOptions } from '../queries'
import { ItemEditor } from './item-editor'
import { ItemList } from './item-list'
import { lockReason } from './labels'

const EDIT = '/_authed/teach/courses/$courseId_/activities/$activityId/edit'

/**
 * `edit` of a quiz, exam or code challenge: the question list beside the open question's editor; the «Excel» menu loads
 * questions from a DOT file or downloads them in that format (assessment-import).
 */
export function AssessmentEditPage() {
  const { courseId, activityId } = useParams({ from: EDIT })
  const { item: itemId } = useSearch({ from: EDIT })
  const { data: assessment } = useSuspenseQuery(assessmentOptions(activityId))
  const open = openItem(assessment.items, itemId)
  const lock = lockReason(assessment)
  return (
    <div className="@container flex flex-col gap-gutter">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {lock ? <p className="text-sm text-muted-foreground">{lock}</p> : <span />}
        <ExcelMenu courseId={courseId} activityId={activityId} assessment={assessment} />
      </div>
      <div className="grid gap-gutter @3xl:grid-cols-[17rem_minmax(0,1fr)] @3xl:gap-x-8">
        <ItemList courseId={courseId} activityId={activityId} assessment={assessment} openId={open?.id} />
        <div className="min-w-0">
          {open ? <ItemEditor key={open.id} activityId={activityId} assessment={assessment} item={open} /> : null}
        </div>
      </div>
    </div>
  )
}
