import { createFileRoute } from '@tanstack/react-router'

import { RolesPage, rolesOptions } from '#/features/admin'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/roles/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(rolesOptions()),
  staticData: { title: m.platform_nav_roles },
  component: RolesPage,
})
