import type { AdminUser } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { UserAvatar } from '#/shared/components/user-avatar'
import { formatDate } from '#/shared/i18n/format'

import { userName } from '../model/admin'
import { RoleNames } from './role-names'
import { userStatus } from './user-state'

/** A user on a phone: three typeset lines beside the avatar, the whole row opens the panel. */
export function UserRow({ user, namedRoles }: { user: AdminUser; namedRoles: boolean }) {
  return (
    <div className="flex gap-3">
      <UserAvatar name={userName(user)} avatarKey={user.avatar_key} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="min-w-0 text-base font-medium">
            <Link
              variant="stretched"
              from="/admin/users"
              to="/admin/users"
              search={prev => ({ ...prev, user: user.id })}
            >
              <span className="wrap-anywhere">{userName(user)}</span>
            </Link>
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDate(user.created_at_unix)}
          </span>
        </div>
        {user.deleted ? null : (
          <p className="flex flex-wrap gap-x-2 text-muted-foreground">
            <span className="wrap-anywhere">@{user.username}</span>
            <span className="wrap-anywhere">{user.email}</span>
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="wrap-anywhere">{namedRoles ? <RoleNames slugs={user.roles} /> : user.roles.join(', ')}</span>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          {userStatus(user)}
        </p>
      </div>
    </div>
  )
}
