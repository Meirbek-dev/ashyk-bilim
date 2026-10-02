import { createFileRoute, redirect } from '@tanstack/react-router'

import { workspaceHome } from '#/shared/auth/access'

// /admin has no page of its own: it opens the first section the user may see.
export const Route = createFileRoute('/_authed/admin/')({
  beforeLoad: ({ context }) => {
    throw redirect({ to: workspaceHome(context.session, 'admin') })
  },
})
