import { Link as RouterLink, useParams } from '@tanstack/react-router'
import { Suspense } from 'react'

import { NextStepLink } from '#/features/player'
import { m } from '#/paraglide/messages'
import type { SubmissionId } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'

import { ATTEMPT_PATH, ATTEMPT_ROUTE } from './attempt-frame'

/**
 * The way on: an attempt already open (looking back at an older result) is continued first, else another attempt
 * when this one did not pass and one is allowed; then the next activity.
 */
export function ResultActions({ retry, draftId }: { retry: boolean; draftId: SubmissionId | null }) {
  const params = useParams({ from: ATTEMPT_ROUTE })
  return (
    <div className="flex flex-wrap items-center gap-2">
      {draftId ? (
        <RouterLink to={ATTEMPT_PATH} params={params} search={{ attempt: draftId }} className={buttonVariants()}>
          {m.attempt_continue_open()}
        </RouterLink>
      ) : retry ? (
        <RouterLink to={ATTEMPT_PATH} params={params} search={{}} className={buttonVariants()}>
          {m.attempt_try_again()}
        </RouterLink>
      ) : null}
      <Suspense fallback={null}>
        <NextStepLink
          courseId={params.courseId}
          activityId={params.activityId}
          variant={retry || draftId ? 'outline' : 'default'}
        />
      </Suspense>
    </div>
  )
}
