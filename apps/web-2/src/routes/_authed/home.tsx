import { createFileRoute } from '@tanstack/react-router'

import { ensureHome, HomePage } from '#/features/home'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/home')({
  loader: ({ context }) => ensureHome(context.queryClient),
  staticData: { title: m.home_title },
  component: HomePage,
})
