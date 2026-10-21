import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Suspense } from 'react'

import { RemediationGate } from '#/features/ai'
import { MarkdownView } from '#/features/markdown'
import { ActivityHeader, NextStepLink } from '#/features/player'
import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'

import { needsRemediation } from '../model/attempt'
import { attemptsOptions, stateOptions } from '../queries'
import { ATTEMPT_ROUTE, AttemptFrame, useActivityTitle } from './attempt-frame'
import { AttemptsList } from './attempts-list'
import { EntryAction } from './entry-action'
import { PolicySummary } from './policy-summary'

/** The entry (B-ATT-02..05, B-ATT-20): what the attempt is like, the one action, the attempts made so far. */
export function AttemptEntry({ assessment }: { assessment: AssessmentDetail }) {
  const { data: state } = useSuspenseQuery(stateOptions(assessment.id))
  const { data: attempts } = useSuspenseQuery(attemptsOptions(assessment.id))
  const params = useParams({ from: ATTEMPT_ROUTE })
  const title = useActivityTitle()
  // After a hand-in the learner may as well move on: the next activity beside another attempt (B-PLY-18).
  const handedIn = attempts.some(attempt => attempt.status !== 'draft')
  return (
    <AttemptFrame>
      <article className="flex flex-col gap-gutter">
        <ActivityHeader type={assessment.kind} title={title} />
        {assessment.description ? (
          <Suspense fallback={null}>
            <MarkdownView content={assessment.description} />
          </Suspense>
        ) : null}
        <PolicySummary assessment={assessment} state={state} />
        <EntryAction assessment={assessment} state={state} />
        {handedIn ? (
          <div>
            <Suspense fallback={null}>
              <NextStepLink courseId={params.courseId} activityId={params.activityId} variant="outline" />
            </Suspense>
          </div>
        ) : null}
        {needsRemediation(state) ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{m.attempt_remediation_heading()}</h2>
            <Suspense fallback={null}>
              <RemediationGate
                activityId={assessment.activity_id}
                invalidates={[stateOptions(assessment.id).queryKey, attemptsOptions(assessment.id).queryKey]}
              />
            </Suspense>
          </section>
        ) : null}
        <AttemptsList attempts={attempts} />
      </article>
    </AttemptFrame>
  )
}
