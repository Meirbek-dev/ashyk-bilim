import { createFileRoute } from '@tanstack/react-router'

import { ensureRole, RoleNotFound, RolePage, roleName } from '#/features/admin'
import { m } from '#/paraglide/messages'
import { documentTitle } from '#/shared/lib/document-title'

export const Route = createFileRoute('/_authed/admin/roles/$roleSlug')({
  loader: async ({ context, params }) => ({ name: roleName(await ensureRole(context.queryClient, params.roleSlug)) }),
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: documentTitle(loaderData.name) }] : [] }),
  staticData: { title: m.platform_nav_roles, notFoundTitle: m.admin_role_not_found },
  component: RolePage,
  notFoundComponent: RoleNotFound,
})
