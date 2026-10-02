import { createFileRoute } from '@tanstack/react-router'

import { DetailLayout } from '#/features/platform'
import { m } from '#/paraglide/messages'

// The course page (spec 5.4): tabs are child routes.
export const Route = createFileRoute('/_public/courses/$courseId')({
  staticData: {
    title: m.platform_page_course,
    tabs: [
      { to: '/courses/$courseId/about', label: m.platform_tab_about },
      { to: '/courses/$courseId/updates', label: m.platform_tab_updates },
      { to: '/courses/$courseId/discussions', label: m.platform_tab_discussions },
    ],
  },
  component: DetailLayout,
})
