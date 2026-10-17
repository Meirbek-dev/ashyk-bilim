import type { QueryClient } from '@tanstack/react-query'

import { startEventStream } from '#/shared/api/events'
import { dashboardOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { XpAwarded } from '#/shared/api/gen/types.gen'
import { toast } from '#/shared/ui/toast'

import { xpAwardToasts } from './model/notifications'
import { applyCreated, applyRead } from './queries'

/**
 * The XP toasts for one award: "Report the XP I earn" is on unless the profile says otherwise (the settings' switch,
 * B-SET-13); a level above the cached profile's (read before the award's refetch lands) adds the level-up toast.
 */
async function xpToasts(queryClient: QueryClient, award: XpAwarded): Promise<string[]> {
  const profile = await queryClient
    .query({ ...dashboardOptions(), staleTime: 'static' })
    .then(data => data.profile)
    .catch(() => null)
  if (profile?.settings.notifications.xp_gain === false) return []
  return xpAwardToasts(award, profile?.level ?? null)
}

/** The stream with this feature's own reactions: notifications change the cache, XP shows the ordinary toast. */
export function startLive(queryClient: QueryClient): () => void {
  return startEventStream(queryClient, event => {
    if (event.event === 'notification.created') applyCreated(queryClient, event.payload)
    if (event.event === 'notification.read')
      applyRead(queryClient, event.payload.notification_id, { unread_count: event.payload.unread_count })
    if (event.event === 'xp.awarded')
      void xpToasts(queryClient, event.payload).then(titles => titles.map(title => toast.add({ title })))
  })
}
