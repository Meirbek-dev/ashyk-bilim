import { createFileRoute } from '@tanstack/react-router'

import { SettingsLayout } from '#/features/platform'
import { m } from '#/paraglide/messages'

// Settings (spec 5.4): profile, security, appearance, notifications; each section is a route.
export const Route = createFileRoute('/_authed/settings')({
  staticData: {
    title: m.platform_page_settings,
    tabs: [
      { to: '/settings/profile', label: m.platform_tab_profile },
      { to: '/settings/security', label: m.platform_tab_security },
      { to: '/settings/appearance', label: m.platform_tab_appearance },
      { to: '/settings/notifications', label: m.platform_page_notifications },
    ],
  },
  component: SettingsLayout,
})
