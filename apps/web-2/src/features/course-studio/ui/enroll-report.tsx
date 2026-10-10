import { m } from '#/paraglide/messages'
import type { EnrollLearnersResponse, EnrollOutcome } from '#/shared/api/gen/types.gen'

import { OUTCOMES, summarize } from '../model/roster'

const outcomeLabels: Record<EnrollOutcome, () => string> = {
  enrolled: m.studio_roster_outcome_enrolled,
  already_enrolled: m.studio_roster_outcome_already_enrolled,
  duplicate: m.studio_roster_outcome_duplicate,
  not_found: m.studio_roster_outcome_not_found,
  course_staff: m.studio_roster_outcome_course_staff,
  account_disabled: m.studio_roster_outcome_account_disabled,
}

/** What one enrol request did: a count per outcome, then each identifier that was not added and why. */
export function EnrollReport({ result }: { result: EnrollLearnersResponse }) {
  const { counts, problems } = summarize(result.results)
  return (
    <section aria-label={m.studio_roster_report()} className="flex flex-col gap-2 rounded-md border p-4 text-sm">
      <h3 className="font-medium">{m.studio_roster_report()}</h3>
      <ul className="flex flex-col gap-1">
        {OUTCOMES.filter(outcome => counts[outcome] > 0).map(outcome => (
          <li key={outcome} className="tabular-nums">
            {outcomeLabels[outcome]()}: {counts[outcome]}
          </li>
        ))}
      </ul>
      {problems.length > 0 ? (
        <>
          <h4 className="font-medium">{m.studio_roster_problems()}</h4>
          <ul className="flex flex-col gap-1">
            {problems.map((problem, index) => (
              <li key={`${index}-${problem.identifier}`} className="wrap-anywhere">
                {problem.identifier} - {outcomeLabels[problem.outcome]()}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
