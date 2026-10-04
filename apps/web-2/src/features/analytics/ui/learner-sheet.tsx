import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { AtRiskLearnerRow, CourseId, UserId } from '#/shared/api/gen/types.gen'
import { SheetPanel } from '#/shared/components/sheet-panel'
import { formatDate } from '#/shared/i18n/format'

import { recommendedActionLabels, riskReasonLabels, whyNowLabels } from '../model/signals'
import { interventionsOptions } from '../queries'
import { InterventionDialog } from './intervention-dialog'
import { InterventionEditDialog } from './intervention-edit-dialog'
import { interventionOutcomeLabels, interventionStatusLabels, interventionTypeLabels } from './labels'

type LearnerSheetProps = {
  learnerId: UserId
  courseId: CourseId
  /** The at-risk row on the page; a forwarded link to a learner not on this page shows a generic title, no risk. */
  row: AtRiskLearnerRow | undefined
}

/**
 * The learner open by `?learnerId=&courseId=`: why now, what to do and the risk signals (from the row), the
 * interventions in this course, newest first, and a new one.
 */
export function LearnerSheet({ learnerId, courseId, row }: LearnerSheetProps) {
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
      title={row?.user_display_name ?? m.analytics_col_learner()}
    >
      {row ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{m.analytics_col_course()}</dt>
          <dd className="wrap-anywhere">{row.course_name}</dd>
          <dt className="text-muted-foreground">{m.analytics_col_why_now()}</dt>
          <dd>{whyNowLabels[row.why_now]()}</dd>
          <dt className="text-muted-foreground">{m.analytics_learner_action()}</dt>
          <dd>{recommendedActionLabels[row.recommended_action]()}</dd>
          {row.reason_codes.length > 0 ? (
            <>
              <dt className="text-muted-foreground">{m.analytics_learner_reasons()}</dt>
              <dd>{row.reason_codes.map(code => riskReasonLabels[code]()).join(', ')}</dd>
            </>
          ) : null}
          {row.last_intervention_type ? (
            <>
              <dt className="text-muted-foreground">{m.analytics_learner_last_intervention()}</dt>
              <dd>{interventionTypeLabels[row.last_intervention_type]()}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
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
              {item.outcome_code ? (
                <span>
                  {m.analytics_intervention_outcome_is({ outcome: interventionOutcomeLabels[item.outcome_code]() })}
                </span>
              ) : null}
              {item.notes ? <span className="wrap-anywhere whitespace-pre-line">{item.notes}</span> : null}
              {item.allowed_actions.includes('update') ? (
                <div>
                  <InterventionEditDialog item={item} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SheetPanel>
  )
}
