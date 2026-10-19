import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { ShowMore } from '#/shared/components/show-more'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'

import { deviceLabel, orderSessions } from '../model/settings'
import { sessionsOptions } from '../queries'
import { PlainSection } from './plain-section'
import { RevokeOtherSessions } from './revoke-other-sessions'
import { RevokeSession } from './revoke-session'

// Someone who never signs out has dozens of sessions: the latest few, the rest a click away (B-SET-20).
const FIRST = 5

/** Every live session of the user: this device first; any other can be ended, or all of them at once. */
export function SessionsSection() {
  const { data } = useSuspenseQuery(sessionsOptions())
  const [all, setAll] = useState(false)
  const ordered = orderSessions(data)
  const others = data.filter(session => !session.current).map(session => session.handle)
  return (
    <PlainSection title={m.settings_sessions_title()} description={m.settings_sessions_hint()}>
      {others.length > 1 ? (
        <div>
          <RevokeOtherSessions handles={others} />
        </div>
      ) : null}
      <DataList items={all ? ordered : ordered.slice(0, FIRST)} getKey={session => session.handle} variant="rows">
        {session => {
          const device = deviceLabel(session.user_agent) ?? m.settings_session_unknown_device()
          return (
            <div className="flex flex-col gap-2 @md:flex-row @md:items-start @md:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{device}</h3>
                  {session.current ? <StatusBadge tone="info">{m.settings_session_current()}</StatusBadge> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {m.settings_session_seen({ date: formatDateTime(session.last_seen_unix) })}
                  {session.ip ? ` · ${m.settings_session_ip({ ip: session.ip })}` : null}
                </p>
              </div>
              {session.current ? null : <RevokeSession handle={session.handle} device={device} />}
            </div>
          )
        }}
      </DataList>
      <ShowMore hasMore={!all && ordered.length > FIRST} pending={false} onMore={() => setAll(true)} />
    </PlainSection>
  )
}
