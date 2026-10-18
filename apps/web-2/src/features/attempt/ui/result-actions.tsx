import { Link as RouterLink, useParams } from '@tanstack/react-router'
import { Suspense } from 'react'

import { NextStepLink } from '#/features/player'
import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'

import { ATTEMPT_PATH, ATTEMPT_ROUTE } from './attempt-frame'

/** The way on: another attempt first when this one did not pass and one is open, then the next activity. */
export function ResultActions({ retry }: { retry: boolean }) {
  const params = useParams({ from: ATTEMPT_ROUTE })
  return (
    <div className="flex flex-wrap items-center gap-2">
      {retry ? (
        <RouterLink to={ATTEMPT_PATH} params={params} search={{}} className={buttonVariants()}>
          {m.attempt_try_again()}
        </RouterLink>
      ) : null}
      <Suspense fallback={null}>
        <NextStepLink
          courseId={params.courseId}
          activityId={params.activityId}
          variant={retry ? 'outline' : 'default'}
        />
      </Suspense>
    </div>
  )
}
