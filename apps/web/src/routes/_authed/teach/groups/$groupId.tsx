import { createFileRoute } from '@tanstack/react-router'

import { ensureGroup, GroupNotFound, GroupPage } from '#/features/admin'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/groups/$groupId')({
  loader: ({ context, params }) => ensureGroup(context.queryClient, params.groupId),
  staticData: { title: m.platform_nav_groups },
  component: GroupPage,
  notFoundComponent: GroupNotFound,
})
