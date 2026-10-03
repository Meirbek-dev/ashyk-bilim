import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'

import { needsRemediation } from '../model/attempt'
import { attemptsOptions, stateOptions } from '../queries'
import { AttemptFrame } from './attempt-frame'
import { attemptSlots } from './attempt-slots'
import { AttemptsList } from './attempts-list'
import { EntryAction } from './entry-action'
import { PolicySummary } from './policy-summary'

/** The entry (B-ATT-02..05, B-ATT-20): what the attempt is like, the one action, the attempts made so far. */
export function AttemptEntry({ assessment }: { assessment: AssessmentDetail }) {
  const { data: state } = useSuspenseQuery(stateOptions(assessment.id))
  const { data: attempts } = useSuspenseQuery(attemptsOptions(assessment.id))
  const Remediation = attemptSlots.remediation
  return (
    <AttemptFrame title={assessment.title}>
      <article className="flex flex-col gap-gutter">
        <h1 className="text-2xl font-semibold wrap-anywhere">{assessment.title}</h1>
        {assessment.description ? (
          <Suspense fallback={null}>
            <MarkdownView content={assessment.description} />
          </Suspense>
        ) : null}
        <PolicySummary assessment={assessment} state={state} />
        <EntryAction assessment={assessment} state={state} />
        {needsRemediation(state) ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{m.attempt_remediation_heading()}</h2>
            {Remediation ? <Remediation assessmentId={assessment.id} submissionId={attempts[0]?.id ?? null} /> : null}
          </section>
        ) : null}
        <AttemptsList attempts={attempts} />
      </article>
    </AttemptFrame>
  )
}
