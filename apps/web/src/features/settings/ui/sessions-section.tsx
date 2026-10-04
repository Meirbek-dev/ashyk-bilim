import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'

import { deviceLabel, orderSessions } from '../model/settings'
import { sessionsOptions } from '../queries'
import { PlainSection } from './plain-section'
import { RevokeSession } from './revoke-session'

/** Every live session of the user: this device first; any other can be ended. */
export function SessionsSection() {
  const { data } = useSuspenseQuery(sessionsOptions())
  return (
    <PlainSection title={m.settings_sessions_title()} description={m.settings_sessions_hint()}>
      <DataList items={orderSessions(data)} getKey={session => session.handle}>
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
                  {m.settings_session_seen({ date: formatDate(session.last_seen_unix) })}
                </p>
                {session.ip ? (
                  <p className="text-sm text-muted-foreground">{m.settings_session_ip({ ip: session.ip })}</p>
                ) : null}
              </div>
              {session.current ? null : <RevokeSession handle={session.handle} device={device} />}
            </div>
          )
        }}
      </DataList>
    </PlainSection>
  )
}
