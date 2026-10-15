import { type QueryKey, useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import type { ActivityId } from '#/shared/api/gen/types.gen'
import { sessionOptions } from '#/shared/auth/session'
import { ListSkeleton } from '#/shared/components/list-skeleton'

import { PanelError } from './panel-error'
import { RemediationSessions } from './remediation-sessions'

export type GateProps = { activityId: ActivityId; invalidates: QueryKey[] }

/**
 * The remediation where it blocks the learner (B-AI-26): the quiz entry, the file task, the code task show the
 * activity's sessions in place; passing one re-reads the host's attempt state (`invalidates`), which lifts the gate.
 */
export function RemediationGate(props: GateProps) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  if (!session) return null
  return (
    <CatchBoundary getResetKey={() => props.activityId} errorComponent={PanelError}>
      <Suspense fallback={<ListSkeleton />}>
        <RemediationSessions {...props} userId={session.user_id} />
      </Suspense>
    </CatchBoundary>
  )
}
