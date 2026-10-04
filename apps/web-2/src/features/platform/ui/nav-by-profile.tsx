import { useSuspenseQuery } from '@tanstack/react-query'

import { dashboardOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import { gamificationOn, visibleSections } from '#/shared/auth/access'

import type { NavProps } from './nav-sections'

export function NavByProfile({ session, workspace, render }: NavProps) {
  const { data: gamification } = useSuspenseQuery({ ...dashboardOptions(), select: gamificationOn })
  return render(visibleSections(session, workspace, gamification))
}
