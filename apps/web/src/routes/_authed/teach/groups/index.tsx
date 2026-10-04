import { createFileRoute } from '@tanstack/react-router'

import { GroupsPage, groupsListOptions } from '#/features/admin'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/groups/')({
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(groupsListOptions()),
  staticData: { title: m.platform_nav_groups },
  component: GroupsPage,
})
