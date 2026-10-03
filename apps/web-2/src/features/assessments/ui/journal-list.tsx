import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AuditEvent } from '#/shared/api/gen/types.gen'
import { sessionOptions } from '#/shared/auth/session'
import { formatDateTime } from '#/shared/i18n/format'

import { auditActor, lifecycleOf } from '../model/publishing'
import { auditOptions } from '../queries'
import { eventLabels, lifecycleBadges } from './labels'

function actorLabel(event: AuditEvent, me: string): string {
  const actor = auditActor(event, me)
  if (actor === 'you') return m.assessments_actor_you()
  if (actor === 'system') return m.assessments_actor_system()
  return event.actor_name ?? m.assessments_actor_other()
}

function detail(event: AuditEvent): string | null {
  const from = lifecycleOf(event.payload.from)
  const to = lifecycleOf(event.payload.to)
  if (event.event !== 'lifecycle-transition' || !from || !to) return null
  return m.assessments_event_transition({ from: lifecycleBadges[from].label(), to: lifecycleBadges[to].label() })
}

/** The assessment's events, newest first: when, what (a transition names its states) and who. */
export function JournalList({ assessmentId }: { assessmentId: string }) {
  const { data: events } = useSuspenseQuery(auditOptions(assessmentId))
  const { data: session } = useSuspenseQuery(sessionOptions())
  if (events.length === 0) return <p className="text-sm text-muted-foreground">{m.assessments_journal_empty()}</p>
  return (
    <ol className="flex flex-col">
      {events.map(event => {
        const extra = detail(event)
        return (
          <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 border-b py-2 text-sm">
            <span className="text-muted-foreground tabular-nums">{formatDateTime(event.created_at_unix)}</span>
            <span className="font-medium">{eventLabels[event.event]()}</span>
            {extra ? <span>{extra}</span> : null}
            <span className="text-muted-foreground">{actorLabel(event, session?.user.id ?? '')}</span>
          </li>
        )
      })}
    </ol>
  )
}
