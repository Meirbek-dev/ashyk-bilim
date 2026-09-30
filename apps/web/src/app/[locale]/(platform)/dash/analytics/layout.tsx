import { Suspense } from 'react'
import type { ReactNode } from 'react'

import { requireAnyPermission } from '@/lib/auth/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'

// Mirrors the server gate on `GET /analytics/teacher/*`
// (`analytics:read:{assigned,platform,all}`): a learner lands on /unauthorized
// like on /dash/admin instead of an inline 403.
async function Gate({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.READ, resource: Resources.ANALYTICS, scope: Scopes.ASSIGNED },
    { action: Actions.READ, resource: Resources.ANALYTICS, scope: Scopes.APP },
    { action: Actions.READ, resource: Resources.ANALYTICS, scope: Scopes.ALL },
  ])
  return <>{children}</>
}

// The session read is dynamic; the boundary keeps the dev "uncached data
// outside <Suspense>" notice off the page.
export default function PlatformAnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  )
}
