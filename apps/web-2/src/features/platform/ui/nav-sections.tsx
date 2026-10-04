import { CatchBoundary, useHydrated } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense } from 'react'

import type { SessionInfo } from '#/shared/api/gen/types.gen'
import { type Section, visibleSections, type Workspace } from '#/shared/auth/access'

export type NavProps = { session: SessionInfo; workspace: Workspace; render: (sections: Section[]) => ReactNode }

// The profile read loads after the entry (G-05: no generated SDK there).
const ByProfile = lazy(() => import('./nav-by-profile').then(module => ({ default: module.NavByProfile })))

/**
 * The nav's sections: all of them on the server, before hydration, while the profile loads and if it fails; then
 * without Achievements when the user turned gamification off (B-ACH-13).
 */
export function NavSections(props: NavProps) {
  const all = props.render(visibleSections(props.session, props.workspace))
  if (!useHydrated()) return all
  return (
    <CatchBoundary getResetKey={() => props.session.user_id} errorComponent={() => all}>
      <Suspense fallback={all}>
        <ByProfile {...props} />
      </Suspense>
    </CatchBoundary>
  )
}
