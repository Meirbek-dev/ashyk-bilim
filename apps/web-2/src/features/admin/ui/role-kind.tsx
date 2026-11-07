import type { Role } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'

import { roleKindLabels } from './labels'

// Most roles are the system's: that is quiet text; a role made here is the exception and gets the badge.
export const roleKind = (role: Role) =>
  role.is_system ? (
    <span className="text-muted-foreground">{roleKindLabels.system()}</span>
  ) : (
    <StatusBadge tone="info">{roleKindLabels.custom()}</StatusBadge>
  )
