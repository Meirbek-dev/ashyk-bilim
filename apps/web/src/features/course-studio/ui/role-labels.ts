import { m } from '#/paraglide/messages'

import type { RosterRole } from '#/shared/api/gen/types.gen'

export const roleLabels: Record<RosterRole, () => string> = {
  creator: m.studio_role_creator,
  maintainer: m.studio_role_maintainer,
  contributor: m.studio_role_contributor,
  reporter: m.studio_role_reporter,
}
