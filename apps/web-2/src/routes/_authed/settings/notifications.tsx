import { createFileRoute } from '@tanstack/react-router'

import { NotificationPreferences, preferencesOptions } from '#/features/notifications'
import { NotificationsPage, gamificationOptions } from '#/features/settings'
import { m } from '#/paraglide/messages'

// The page is the settings feature's; the per-type switches are the notifications feature's section (N-2).
function NotificationSettings() {
  return (
    <>
      <NotificationPreferences />
      <NotificationsPage />
    </>
  )
}

export const Route = createFileRoute('/_authed/settings/notifications')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(gamificationOptions()),
      context.queryClient.ensureQueryData(preferencesOptions()),
    ]),
  staticData: { title: m.platform_page_notifications },
  component: NotificationSettings,
})
