import Users from '@/components/Dashboard/Pages/Users/Users/Users'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'

// Mirrors the server gate on `GET /users` (`platform:read:platform`); see
// `canSeeUsers` in lib/rbac/navigation-policy.ts.
export default async function UsersPage() {
  await requireAnyPermission([
    { action: Actions.READ, resource: Resources.APP, scope: Scopes.APP },
    { action: Actions.UPDATE, resource: Resources.USER, scope: Scopes.APP },
  ])
  return <Users />
}
