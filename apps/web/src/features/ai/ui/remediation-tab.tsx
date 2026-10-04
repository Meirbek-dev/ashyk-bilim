import { Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AiRemediationSessionId, RemediationSession, UserId } from '#/shared/api/gen/types.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'

import { sessionStatusLabels } from '../model/labels'
import { RemediationSessionView } from './remediation-session'

type RemediationTabProps = { sessions: RemediationSession[]; userId: UserId }

/** The learner's remediation sessions of this activity (B-AI-19); one opens at a time. */
export function RemediationTab({ sessions, userId }: RemediationTabProps) {
  const [openId, setOpenId] = useState<AiRemediationSessionId | null>(sessions[0]?.id ?? null)
  const open = sessions.find(session => session.id === openId)
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {sessions.map(session => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 wrap-anywhere">{session.lecture.title}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge tone={session.status === 'passed' ? 'success' : 'warning'}>
                {sessionStatusLabels[session.status]()}
              </StatusBadge>
              {formatDate(session.created_at_unix)}
              {session.id === openId ? null : (
                <Button variant="ghost" size="sm" onClick={() => setOpenId(session.id)}>
                  {m.ai_remediation_open()}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {open ? (
        <Suspense fallback={<ListSkeleton />}>
          <RemediationSessionView key={open.id} session={open} userId={userId} />
        </Suspense>
      ) : null}
    </div>
  )
}
