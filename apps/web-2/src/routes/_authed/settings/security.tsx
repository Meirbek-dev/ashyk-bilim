import { createFileRoute } from '@tanstack/react-router'

import { SecurityPage, profileOptions, sessionsOptions } from '#/features/settings'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/settings/security')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(profileOptions()),
      context.queryClient.ensureQueryData(sessionsOptions()),
    ]),
  staticData: { title: m.platform_tab_security },
  component: SecurityPage,
})
