import { Actions, Resources, Scopes } from '@/types/permissions'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { Suspense } from 'react'
import type { ReactNode } from 'react'

async function Gate({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.UPDATE, resource: Resources.USER, scope: Scopes.APP },
    { action: Actions.READ, resource: Resources.USER, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.USERGROUP, scope: Scopes.APP },
  ])

  return <>{children}</>
}

// The session read is dynamic; the boundary keeps the dev "uncached data
// outside <Suspense>" notice (an error-level console entry) off every page.
export default function AppUsersLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  )
}
