import { Suspense } from 'react'

import UserGroups from '@/components/Dashboard/Pages/Users/UserGroups/UserGroups'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'

// Mirrors the server gate on `GET /usergroups` (`usergroup:read:platform`).
async function Gate() {
  await requireAnyPermission([
    { action: Actions.READ, resource: Resources.USERGROUP, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.USERGROUP, scope: Scopes.APP },
  ])
  return <UserGroups />
}

// The session read is dynamic; a boundary keeps the dev "uncached data
// outside <Suspense>" notice (an error-level console entry) off the page.
export default function UserGroupsPage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  )
}
