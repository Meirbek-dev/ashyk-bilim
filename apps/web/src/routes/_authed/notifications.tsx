import { createFileRoute } from '@tanstack/react-router'

import { NotificationsPage, notificationsListOptions, unreadOptions } from '#/features/notifications'
import { notificationsSearchSchema } from '#/features/notifications/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/notifications')({
  validateSearch: notificationsSearchSchema,
  loaderDeps: ({ search }) => ({ unread: search.unread ?? false }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureInfiniteQueryData(notificationsListOptions(deps.unread)),
      context.queryClient.ensureQueryData(unreadOptions()),
    ]),
  staticData: { title: m.platform_page_notifications },
  component: NotificationsPage,
})
