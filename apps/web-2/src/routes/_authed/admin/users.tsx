import { createFileRoute } from '@tanstack/react-router'

import { loadUsersPage, UsersPage } from '#/features/admin'
import { usersSearchSchema } from '#/features/admin/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/users')({
  validateSearch: usersSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadUsersPage(context.queryClient, context.session, deps),
  staticData: { title: m.platform_nav_users },
  component: UsersPage,
})
