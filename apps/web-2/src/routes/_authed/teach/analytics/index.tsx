import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/teach/analytics/')({
  beforeLoad: () => {
    throw redirect({ to: '/teach/analytics/overview', search: true })
  },
})
