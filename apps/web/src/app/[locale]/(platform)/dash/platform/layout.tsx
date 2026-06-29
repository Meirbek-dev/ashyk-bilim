import { Actions, Resources, Scopes } from '@/types/permissions'
import { requireAnyPermission } from '@/lib/auth/permissions'
import type { ReactNode } from 'react'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default async function PlatformSettingsLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission(
    [
      { action: Actions.READ, resource: Resources.APP, scope: Scopes.OWN },
      { action: Actions.UPDATE, resource: Resources.APP, scope: Scopes.OWN },
      { action: Actions.READ, resource: Resources.APP, scope: Scopes.APP },
      { action: Actions.UPDATE, resource: Resources.APP, scope: Scopes.APP },
      { action: Actions.MANAGE, resource: Resources.APP, scope: Scopes.APP },
    ],
    '/dash',
  )

  return <>{children}</>
}
