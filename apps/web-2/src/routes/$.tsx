import { createFileRoute, notFound, redirect, rootRouteId } from '@tanstack/react-router'

import { assessmentHome } from '#/features/assessments'
import { ApiError } from '#/shared/api/errors'
import { legacyTarget } from '#/shared/lib/legacy-urls'

// Every address no route takes. An old-web URL (`/ru/course/<id>`, `/dash/...`) moves permanently to its web-2
// page; an old `/assessments/<id>` link goes where that assessment lives now; anything else is «Страница не найдена».
export const Route = createFileRoute('/$')({
  beforeLoad: ({ location }) => {
    const target = legacyTarget(location.href)
    if (typeof target === 'string') throw redirect({ href: target, statusCode: 301 })
    if (target === null) throw notFound({ routeId: rootRouteId })
  },
  loader: async ({ context, location }) => {
    const target = legacyTarget(location.href)
    if (target === null || typeof target === 'string') throw notFound({ routeId: rootRouteId })
    const home = await assessmentHome(context.queryClient, target.assessment).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401)
        throw redirect({ to: '/login', search: { redirect: location.href } })
      throw notFound({ routeId: rootRouteId })
    })
    const studio = `/teach/courses/${home.course_id}/activities/${home.activity_id}`
    throw redirect({
      href: target.review ? `${studio}/submissions/${target.review}` : `/learn/${home.course_id}/${home.activity_id}`,
    })
  },
})
