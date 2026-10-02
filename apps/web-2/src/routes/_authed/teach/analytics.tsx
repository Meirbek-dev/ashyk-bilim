import { createFileRoute } from '@tanstack/react-router'

import { DetailLayout } from '#/features/platform'
import { m } from '#/paraglide/messages'

// Teaching analytics (spec 5.3): a drill-down is a search param of a tab, not a page outside the tabs.
export const Route = createFileRoute('/_authed/teach/analytics')({
  staticData: {
    title: m.platform_nav_analytics,
    tabs: [
      { to: '/teach/analytics/overview', label: m.platform_tab_overview },
      { to: '/teach/analytics/learners', label: m.platform_tab_learners },
      { to: '/teach/analytics/performance', label: m.platform_tab_performance },
      { to: '/teach/analytics/operations', label: m.platform_tab_operations },
    ],
  },
  component: DetailLayout,
})
