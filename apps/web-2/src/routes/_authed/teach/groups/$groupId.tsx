import { createFileRoute } from '@tanstack/react-router'

import { ensureGroup, GroupNotFound, GroupPage } from '#/features/admin'
import { m } from '#/paraglide/messages'
import { documentTitle } from '#/shared/lib/document-title'

export const Route = createFileRoute('/_authed/teach/groups/$groupId')({
  loader: async ({ context, params }) => {
    const [group] = await ensureGroup(context.queryClient, params.groupId)
    return { name: group.name }
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: documentTitle(loaderData.name) }] : [] }),
  staticData: { title: m.platform_nav_groups, notFoundTitle: m.admin_group_not_found },
  component: GroupPage,
  notFoundComponent: GroupNotFound,
})
