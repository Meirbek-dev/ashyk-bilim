import { createFileRoute, notFound, redirect, rootRouteId } from '@tanstack/react-router'

import { assessmentHome } from '#/features/assessments'
import { ApiError } from '#/shared/api/errors'

// Every address no route takes. An old-web URL (`/ru/course/<id>`, `/dash/...`) moves permanently to its web-2
// page; an old `/assessments/<id>` link goes where that assessment lives now; anything else is «Страница не найдена».
// The URL map loads on demand: `beforeLoad` sits in the entry chunk (G-05 initial JS budget).
const legacyTarget = async (href: string) => (await import('#/shared/lib/legacy-urls')).legacyTarget(href)
export const Route = createFileRoute('/$')({
  beforeLoad: async ({ location }) => {
    const target = await legacyTarget(location.href)
    if (typeof target === 'string') throw redirect({ href: target, statusCode: 301 })
    if (target === null) throw notFound({ routeId: rootRouteId })
  },
  loader: async ({ context, location }) => {
    const target = await legacyTarget(location.href)
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
