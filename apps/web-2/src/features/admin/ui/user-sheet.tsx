import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { Link } from '#/shared/components/link'
import { SheetPanel } from '#/shared/components/sheet-panel'
import { StatusBadge } from '#/shared/components/status-badge'
import { UserAvatar } from '#/shared/components/user-avatar'
import { formatDate } from '#/shared/i18n/format'

import { canUser, userName } from '../model/admin'
import { userOptions } from '../queries'
import { AwardXp } from './award-xp'
import { userBadge } from './labels'
import { RoleNames } from './role-names'
import { UserGroup } from './user-group'
import { UserRoles } from './user-roles'
import { UserStatus } from './user-status'

/**
 * The user open by `?user=<id>` (R-07: the address is shareable): who they are, and every action the API lists
 * for them in `allowed_actions`, plus "add to group" and "award XP" by the caller's capabilities. An account its
 * owner deleted says so instead of its placeholder login, address and profile link, and offers nothing to do.
 */
export function UserSheet({ id }: { id: string }) {
  const { data: user } = useSuspenseQuery(userOptions(id))
  const { data: session } = useSuspenseQuery(sessionOptions())
  const navigate = useNavigate({ from: '/admin/users' })
  const close = () => void navigate({ search: prev => ({ ...prev, user: undefined }) })
  const namedRoles = hasCapability(session, 'admin.roles')
  const badge = user ? userBadge(user) : null
  return (
    <SheetPanel
      open
      onOpenChange={open => {
        if (!open) close()
      }}
      side="right"
      title={user ? userName(user) : m.admin_user_not_found()}
    >
      {user && badge ? (
        <>
          {user.deleted ? (
            <p className="text-sm text-muted-foreground">{m.admin_user_deleted_hint()}</p>
          ) : (
            <div className="flex items-center gap-3">
              <UserAvatar name={userName(user)} avatarKey={user.avatar_key} />
              <div className="flex min-w-0 flex-col text-sm">
                <span className="wrap-anywhere">@{user.username}</span>
                <Link to="/users/$username" params={{ username: user.username }}>
                  {m.admin_user_profile()}
                </Link>
              </div>
            </div>
          )}
          <dl className="flex flex-col gap-2 text-sm *:flex *:flex-wrap *:items-center *:gap-x-2">
            {user.deleted ? null : (
              <div>
                <dt className="text-muted-foreground">{m.admin_users_col_email()}</dt>
                <dd className="wrap-anywhere">{user.email}</dd>
              </div>
            )}
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
          {namedRoles && canUser(user, 'manage_roles') ? <UserRoles user={user} /> : null}
          {canUser(user, 'disable') || canUser(user, 'enable') ? <UserStatus user={user} /> : null}
          {hasCapability(session, 'groups.manage') && !user.deleted ? <UserGroup user={user} /> : null}
          {hasCapability(session, 'admin.gamification') && !user.deleted ? <AwardXp user={user} /> : null}
        </>
      ) : user ? null : (
        <p className="text-sm text-muted-foreground">{m.admin_user_not_found_hint()}</p>
      )}
    </SheetPanel>
  )
}
