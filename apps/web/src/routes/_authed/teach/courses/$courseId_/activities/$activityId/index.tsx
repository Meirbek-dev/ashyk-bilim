import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/teach/courses/$courseId/activities/$activityId/edit', params })
  },
})
