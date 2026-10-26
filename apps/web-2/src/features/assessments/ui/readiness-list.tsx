import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { groupedIssues } from '../model/publishing'
import { assessmentReadinessOptions } from '../queries'
import { issueLabels } from './labels'

type ReadinessListProps = { courseId: string; activityId: string; assessment: AssessmentDetail }

/** What the server says blocks publishing (and what is worth a look), each question's issue linking to it. */
export function ReadinessList({ courseId, activityId, assessment }: ReadinessListProps) {
  const { data: readiness } = useSuspenseQuery(assessmentReadinessOptions(assessment.id))
  // «Ready to publish» only before it is: a live one says learners see it, an archived one says nothing here.
  if (readiness.issues.length === 0) {
    if (assessment.lifecycle === 'archived') return null
    return assessment.lifecycle === 'published' ? (
      <p className="text-sm text-muted-foreground">{m.assessments_live()}</p>
    ) : (
      <p className="text-sm text-success">{m.assessments_ready()}</p>
    )
  }
  const title = (id: string) => {
    const item = assessment.items.find(row => row.id === id)
    return item?.title || m.assessments_item_untitled()
  }
  return (
    <div className="flex flex-col gap-3">
      {groupedIssues(readiness.issues).map(({ severity, groups }) => (
        <section key={severity} className="flex flex-col gap-1 text-sm">
          <h3 className={severity === 'blocker' ? 'font-medium text-destructive' : 'font-medium text-warning'}>
            {severity === 'blocker' ? m.assessments_blockers() : m.assessments_warnings()}
          </h3>
          <ul className="flex flex-col gap-2">
            {groups.map(group => (
              <li key={group.itemId ?? 'assessment'} className="flex flex-col gap-0.5">
                <span>{group.codes.map(code => issueLabels[code]()).join(' · ')}</span>
                {group.itemId ? (
                  <Link
                    to="/teach/courses/$courseId/activities/$activityId/edit"
                    params={{ courseId, activityId }}
                    search={{ item: group.itemId }}
                  >
                    {m.assessments_issue_open({ title: title(group.itemId) })}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
