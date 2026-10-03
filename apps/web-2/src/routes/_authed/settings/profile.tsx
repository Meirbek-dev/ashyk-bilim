import { createFileRoute } from '@tanstack/react-router'

import { ProfilePage, profileOptions } from '#/features/settings'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/settings/profile')({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileOptions()),
  staticData: { title: m.platform_tab_profile },
  component: ProfilePage,
})
