import { createFileRoute } from '@tanstack/react-router'

import { HomePage } from '#/features/home'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/home')({
  head: () => ({ meta: [{ title: m.home_title() }] }),
  component: HomePage,
})
