import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, ReadinessIssue } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

import { issueCode, sortedIssues } from '../model/publishing'
import { assessmentReadinessOptions } from '../queries'
import { issueLabels } from './labels'

type ReadinessListProps = { courseId: string; activityId: string; assessment: AssessmentDetail }

const issueText = (issue: ReadinessIssue) => {
  const code = issueCode(issue.code)
  return code ? issueLabels[code]() : m.assessments_issue_unknown()
}

/** What the server says blocks publishing (and what is worth a look), each question's issue linking to it. */
export function ReadinessList({ courseId, activityId, assessment }: ReadinessListProps) {
  const { data: readiness } = useSuspenseQuery(assessmentReadinessOptions(assessment.id))
  if (readiness.issues.length === 0) return <p className="text-sm text-success">{m.assessments_ready()}</p>
  const title = (id: string) => {
    const item = assessment.items.find(row => row.id === id)
    return item?.title || m.assessments_item_untitled()
  }
  return (
    <ul className="flex flex-col gap-2">
      {sortedIssues(readiness.issues).map((issue, at) => (
        <li key={`${issue.code}-${issue.item_id ?? at}`} className="flex flex-col gap-0.5 text-sm">
          <span className={issue.severity === 'blocker' ? 'text-destructive' : 'text-warning'}>
            {issue.severity === 'blocker' ? m.assessments_blockers() : m.assessments_warnings()}: {issueText(issue)}
          </span>
          {issue.item_id ? (
            <Link
              to="/teach/courses/$courseId/activities/$activityId/edit"
              params={{ courseId, activityId }}
              search={{ item: issue.item_id }}
            >
              {m.assessments_issue_open({ title: title(issue.item_id) })}
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
