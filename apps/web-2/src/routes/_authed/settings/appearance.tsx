import { createFileRoute } from '@tanstack/react-router'

import { AppearancePage, profileOptions } from '#/features/settings'
import { m } from '#/paraglide/messages'
import { themeManifestOptions } from '#/shared/api/themes'

export const Route = createFileRoute('/_authed/settings/appearance')({
  // The theme manifest is a static file read by a relative URL: this loader runs in the browser.
  ssr: false,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(profileOptions()),
      context.queryClient.ensureQueryData(themeManifestOptions()),
    ]),
  staticData: { title: m.platform_tab_appearance },
  component: AppearancePage,
})
