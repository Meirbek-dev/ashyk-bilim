import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { Link } from '#/shared/components/link'
import { SheetPanel } from '#/shared/components/sheet-panel'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'

import { canUser } from '../model/admin'
import { userOptions } from '../queries'
import { AwardXp } from './award-xp'
import { userStatusBadges } from './labels'
import { RoleNames } from './role-names'
import { UserGroup } from './user-group'
import { UserRoles } from './user-roles'
import { UserStatus } from './user-status'

/**
 * The user open by `?user=<username>` (R-07: the address is shareable): who they are, and every action the API lists
 * for them in `allowed_actions`, plus "add to group" and "award XP" by the caller's capabilities.
 */
export function UserSheet({ username }: { username: string }) {
  const { data: user } = useSuspenseQuery(userOptions(username))
  const { data: session } = useSuspenseQuery(sessionOptions())
  const navigate = useNavigate()
  const close = () => void navigate({ to: '/admin/users', search: prev => ({ ...prev, user: undefined }) })
  const namedRoles = hasCapability(session, 'admin.roles')
  const badge = user ? userStatusBadges[user.status] : null
  return (
    <SheetPanel
      open
      onOpenChange={open => {
        if (!open) close()
      }}
      side="right"
      title={user ? user.display_name || user.username : m.admin_user_not_found()}
    >
      {user && badge ? (
        <>
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{m.admin_user_username()}</dt>
              <dd className="wrap-anywhere">@{user.username}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{m.admin_users_col_email()}</dt>
              <dd className="wrap-anywhere">{user.email}</dd>
            </div>
            {user.organization ? (
              <div>
                <dt className="text-muted-foreground">{m.admin_user_organization()}</dt>
                <dd className="wrap-anywhere">{user.organization}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">{m.admin_users_col_created()}</dt>
              <dd className="tabular-nums">{formatDate(user.created_at_unix)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{m.admin_users_col_status()}</dt>
              <dd>
                <StatusBadge tone={badge.tone}>{badge.label()}</StatusBadge>
              </dd>
            </div>
            {namedRoles && canUser(user, 'manage_roles') ? null : (
              <div>
                <dt className="text-muted-foreground">{m.admin_users_col_roles()}</dt>
                <dd>{namedRoles ? <RoleNames slugs={user.roles} /> : user.roles.join(', ')}</dd>
              </div>
            )}
          </dl>
          <Link to="/users/$username" params={{ username: user.username }}>
            {m.admin_user_profile()}
          </Link>
          {namedRoles && canUser(user, 'manage_roles') ? <UserRoles user={user} /> : null}
          {canUser(user, 'disable') || canUser(user, 'enable') ? <UserStatus user={user} /> : null}
          {hasCapability(session, 'groups.manage') ? <UserGroup user={user} /> : null}
          {hasCapability(session, 'admin.gamification') ? <AwardXp user={user} /> : null}
        </>
      ) : null}
    </SheetPanel>
  )
}
