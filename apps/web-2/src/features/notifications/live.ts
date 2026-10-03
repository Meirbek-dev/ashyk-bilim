import type { QueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { startEventStream } from '#/shared/api/events'
import { dashboardOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import { formatNumber } from '#/shared/i18n/format'
import { toast } from '#/shared/ui/toast'

import { applyCreated, applyRead } from './queries'

/** "Report the XP I earn" is on unless the profile says otherwise (the settings' switch, B-SET-13). */
async function xpToastsOn(queryClient: QueryClient): Promise<boolean> {
  try {
    const { profile } = await queryClient.ensureQueryData(dashboardOptions())
    return profile.preferences.notifications?.xpGain !== false
  } catch {
    return true
  }
}

/** The stream with this feature's own reactions: notifications change the cache, XP shows the ordinary toast. */
export function startLive(queryClient: QueryClient): () => void {
  return startEventStream(queryClient, event => {
    if (event.event === 'notification.created') applyCreated(queryClient, event.payload)
    if (event.event === 'notification.read')
      applyRead(queryClient, event.payload.notification_id, { unread_count: event.payload.unread_count })
    if (event.event === 'xp.awarded') {
      const amount = formatNumber(event.payload.amount)
      void xpToastsOn(queryClient).then(on => on && toast.add({ title: m.notifications_xp_awarded({ amount }) }))
    }
  })
}
