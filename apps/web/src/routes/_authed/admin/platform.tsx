import { createFileRoute } from '@tanstack/react-router'

import { PlatformPage, platformOptions } from '#/features/admin'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/platform')({
  loader: ({ context }) => context.queryClient.ensureQueryData(platformOptions()),
  staticData: { title: m.platform_nav_platform },
  component: PlatformPage,
})
