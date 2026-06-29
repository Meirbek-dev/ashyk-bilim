import UserGroups from '@/components/Dashboard/Pages/Users/UserGroups/UserGroups'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default function UserGroupsPage() {
  return <UserGroups />
}
