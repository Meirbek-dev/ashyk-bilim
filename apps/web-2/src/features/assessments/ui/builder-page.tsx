import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import { Lock } from 'lucide-react'

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
    // The question is a form: at most 80ch wide (DESIGN 4), beside a list a title fits in on two lines.
    <div className="@container flex max-w-[72.5rem] flex-col gap-gutter">
      {lock ? (
        // A quiet field, not a grey paragraph: it is the reason half the form below is closed.
        <p className="flex items-start gap-3 rounded-lg bg-muted/60 px-4 py-3 text-sm text-pretty">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{lock}</span>
        </p>
      ) : null}
      <div className="flex justify-end">
        <ExcelMenu courseId={courseId} activityId={activityId} assessment={assessment} />
      </div>
      <div className="grid gap-gutter @3xl:grid-cols-[18rem_minmax(0,1fr)] @3xl:gap-x-10">
        <ItemList courseId={courseId} activityId={activityId} assessment={assessment} openId={open?.id} />
        <div className="min-w-0">
          {open ? <ItemEditor key={open.id} activityId={activityId} assessment={assessment} item={open} /> : null}
        </div>
      </div>
    </div>
  )
}
