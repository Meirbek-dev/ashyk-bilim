import { createFileRoute } from '@tanstack/react-router'

import { NotificationsPage, gamificationOptions } from '#/features/settings'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/settings/notifications')({
  loader: ({ context }) => context.queryClient.ensureQueryData(gamificationOptions()),
  staticData: { title: m.platform_page_notifications },
  component: NotificationsPage,
})
