import { createFileRoute } from '@tanstack/react-router'

import { GroupsPage, groupsListOptions } from '#/features/admin'
import { groupsSearchSchema } from '#/features/admin/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/groups/')({
  validateSearch: groupsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.infiniteQuery({ ...groupsListOptions(deps.q), staleTime: 'static' }),
  staticData: { title: m.platform_nav_groups },
  component: GroupsPage,
})
