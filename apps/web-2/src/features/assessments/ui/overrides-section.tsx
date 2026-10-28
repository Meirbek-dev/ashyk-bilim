import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, CourseLearner } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { can } from '../model/route'
import { overridesOptions } from '../queries'
import { OverrideDialog } from './override-dialog'
import { OverrideRow } from './override-row'

/** As the learner picker lists them, «Name (@username)»: two learners often share a display name. */
function learnerName(row: { user_id: string; user_display_name: string | null }, learners: readonly CourseLearner[]) {
  const user = learners.find(learner => learner.user_id === row.user_id)
  if (user) return `${user.display_name} (@${user.username})`
  return row.user_display_name ?? m.assessments_learner_unknown()
}

type OverridesSectionProps = { assessment: AssessmentDetail; learners: readonly CourseLearner[] }

/** "Exceptions": learners with their own terms; a new one picks a learner of the course without one. */
export function OverridesSection({ assessment, learners }: OverridesSectionProps) {
  const { data: rows } = useSuspenseQuery(overridesOptions(assessment.id))
  const editable = can(assessment, 'update')
  const free = learners.filter(user => !rows.some(row => row.user_id === user.user_id))
  return (
    <section aria-labelledby="exceptions-title" className="flex max-w-prose flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="exceptions-title" className="text-xl font-semibold">
          {m.assessments_nav_exceptions()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.assessments_exceptions_hint()}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {/* With nobody enrolled there is no «Добавить исключение» yet: say why, not just «none». */}
          {editable && learners.length === 0
            ? m.assessments_exceptions_no_learners()
            : m.assessments_exceptions_empty()}
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map(row => (
            <OverrideRow
              key={row.user_id}
              assessmentId={assessment.id}
              row={row}
              name={learnerName(row, learners)}
              editable={editable}
            />
          ))}
        </ul>
      )}
      {editable && free.length > 0 ? (
        <div>
          <OverrideDialog
            assessmentId={assessment.id}
            learners={free}
            trigger={
              <Button variant="outline">
                <Plus data-icon="inline-start" aria-hidden />
                {m.assessments_exception_add()}
              </Button>
            }
          />
        </div>
      ) : null}
    </section>
  )
}
