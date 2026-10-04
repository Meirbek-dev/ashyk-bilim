import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/teach/courses/$courseId/overview', params })
  },
})
