import { createFileRoute } from '@tanstack/react-router'

import { ensureRole, RoleNotFound, RolePage } from '#/features/admin'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/roles/$roleSlug')({
  loader: ({ context, params }) => ensureRole(context.queryClient, params.roleSlug),
  staticData: { title: m.platform_nav_roles },
  component: RolePage,
  notFoundComponent: RoleNotFound,
})
