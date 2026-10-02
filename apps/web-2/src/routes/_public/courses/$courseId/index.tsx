import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/courses/$courseId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/courses/$courseId/about', params })
  },
})
