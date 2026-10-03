import { m } from '#/paraglide/messages'

import type { ContributorRole } from '../model/studio'

export const roleLabels: Record<ContributorRole, () => string> = {
  creator: m.studio_role_creator,
  maintainer: m.studio_role_maintainer,
  contributor: m.studio_role_contributor,
  reporter: m.studio_role_reporter,
}
