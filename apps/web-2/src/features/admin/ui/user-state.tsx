import type { AdminUser } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'

import { userBadge } from './labels'

// The usual state is quiet text; a disabled or deleted account gets a badge, so it stands out in a page of actives.
export const userStatus = (user: AdminUser) => {
  const badge = userBadge(user)
  return user.status === 'active' ? (
    <span className="text-muted-foreground">{badge.label()}</span>
  ) : (
    <StatusBadge tone={badge.tone}>{badge.label()}</StatusBadge>
  )
}
