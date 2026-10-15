import { useSuspenseQuery } from '@tanstack/react-query'

import type { UserId } from '#/shared/api/gen/types.gen'

import { sessionsOf } from '../model/ai'
import { sessionsOptions } from '../queries'
import type { GateProps } from './remediation-gate'
import { RemediationTab } from './remediation-tab'

/** The gate's content: the learner's sessions of this activity, nothing when there are none. */
export function RemediationSessions({ activityId, invalidates, userId }: GateProps & { userId: UserId }) {
  const { data } = useSuspenseQuery(sessionsOptions(userId))
  const sessions = sessionsOf(data, activityId)
  return sessions.length > 0 ? <RemediationTab sessions={sessions} userId={userId} invalidates={invalidates} /> : null
}
