import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { CourseId, UserId } from '#/shared/api/gen/types.gen'
import { SheetPanel } from '#/shared/components/sheet-panel'
import { formatDate } from '#/shared/i18n/format'

import { interventionsOptions } from '../queries'
import { InterventionDialog } from './intervention-dialog'
import { interventionStatusLabels, interventionTypeLabels } from './labels'

type LearnerSheetProps = {
  learnerId: UserId
  courseId: CourseId
  /** From the at-risk row on the page; a forwarded link to a learner no longer listed shows a generic title. */
  name: string | undefined
  course: string | undefined
}

/** The learner open by `?learnerId=&courseId=`: the interventions in this course, newest first, and a new one. */
export function LearnerSheet({ learnerId, courseId, name, course }: LearnerSheetProps) {
  const { data } = useSuspenseQuery(interventionsOptions(learnerId, courseId))
  const navigate = useNavigate()
  const close = () =>
    void navigate({ to: '.', search: prev => ({ ...prev, learnerId: undefined, courseId: undefined }) })
  return (
    <SheetPanel
      open
      onOpenChange={open => {
        if (!open) close()
      }}
      side="right"
      title={name ?? m.analytics_col_learner()}
    >
      {course ? <p className="text-sm wrap-anywhere text-muted-foreground">{course}</p> : null}
      <div>
        <InterventionDialog learnerId={learnerId} courseId={courseId} />
      </div>
      <h3 className="font-medium">{m.analytics_interventions_title()}</h3>
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.analytics_interventions_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map(item => (
            <li key={item.id} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{interventionTypeLabels[item.intervention_type]()}</span>
              <span className="text-muted-foreground">
                {interventionStatusLabels[item.status]()} · {formatDate(item.created_at_unix)}
              </span>
              {item.notes ? <span className="wrap-anywhere whitespace-pre-line">{item.notes}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </SheetPanel>
  )
}
