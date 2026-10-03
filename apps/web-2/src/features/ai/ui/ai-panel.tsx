import { useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import { sessionOptions } from '#/shared/auth/session'
import { ListSkeleton } from '#/shared/components/list-skeleton'

import type { Scope } from '../queries'
import { PanelBody } from './panel-body'
import { PanelError } from './panel-error'

/**
 * The one AI panel (B-AI-01): the player's and the studio's right slot, the course page's sheet. A guest gets
 * nothing; a failure stays inside the panel and never takes the page down.
 */
export function AiPanel(scope: Scope) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  if (!session) return null
  return (
    <CatchBoundary getResetKey={() => `${scope.courseId}:${scope.activityId ?? ''}`} errorComponent={PanelError}>
      <Suspense fallback={<ListSkeleton />}>
        <PanelBody scope={scope} userId={session.user_id} />
      </Suspense>
    </CatchBoundary>
  )
}
