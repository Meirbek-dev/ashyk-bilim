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
import { Fact } from './fact'
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
        // In line with the panel's title; each section below opens on a hairline.
        <div className="flex flex-col gap-5 text-sm">
          {user.deleted ? (
            <p className="text-muted-foreground">{m.admin_user_deleted_hint()}</p>
          ) : (
            <div className="flex items-center gap-3">
              <UserAvatar name={userName(user)} avatarKey={user.avatar_key} />
              <div className="flex min-w-0 flex-col">
                <span className="wrap-anywhere">@{user.username}</span>
                <Link to="/users/$username" params={{ username: user.username }}>
                  {m.admin_user_profile()}
                </Link>
              </div>
            </div>
          )}
          <dl className="flex flex-col divide-y border-y">
            {user.deleted ? null : (
              <Fact label={m.admin_users_col_email()}>
                <span className="wrap-anywhere">{user.email}</span>
              </Fact>
            )}
            {user.organization ? (
              <Fact label={m.admin_user_organization()}>
                <span className="wrap-anywhere">{user.organization}</span>
              </Fact>
            ) : null}
            <Fact label={m.admin_users_col_created()}>
              <span className="tabular-nums">{formatDate(user.created_at_unix)}</span>
            </Fact>
            <Fact label={m.admin_users_col_status()}>
              {/* The usual state is quiet text, as in the table; the badge is for the exception. */}
              {user.status === 'active' ? badge.label() : <StatusBadge tone={badge.tone}>{badge.label()}</StatusBadge>}
            </Fact>
            {namedRoles && canUser(user, 'manage_roles') ? null : (
              <Fact label={m.admin_users_col_roles()}>
                {namedRoles ? <RoleNames slugs={user.roles} /> : user.roles.join(', ')}
              </Fact>
            )}
          </dl>
          {namedRoles && canUser(user, 'manage_roles') ? <UserRoles user={user} /> : null}
          {hasCapability(session, 'groups.manage') && !user.deleted ? <UserGroup user={user} /> : null}
          {hasCapability(session, 'admin.gamification') && !user.deleted ? <AwardXp user={user} /> : null}
          {canUser(user, 'disable') || canUser(user, 'enable') ? <UserStatus user={user} /> : null}
        </div>
      ) : user ? null : (
        <p className="text-sm text-muted-foreground">{m.admin_user_not_found_hint()}</p>
      )}
    </SheetPanel>
  )
}
