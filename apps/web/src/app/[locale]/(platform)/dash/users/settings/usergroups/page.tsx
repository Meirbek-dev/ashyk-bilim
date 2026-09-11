import UserGroups from '@/components/Dashboard/Pages/Users/UserGroups/UserGroups'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'

// Mirrors the server gate on `GET /usergroups` (`usergroup:read:platform`).
export default async function UserGroupsPage() {
  await requireAnyPermission([
    { action: Actions.READ, resource: Resources.USERGROUP, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.USERGROUP, scope: Scopes.APP },
  ])
  return <UserGroups />
}
