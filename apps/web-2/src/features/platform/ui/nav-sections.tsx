import { CatchBoundary, useHydrated } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense, useState } from 'react'

import type { SessionInfo } from '#/shared/api/gen/types.gen'
import { type Section, visibleSections, type Workspace } from '#/shared/auth/access'

type NavProps = { session: SessionInfo; workspace: Workspace; render: (sections: Section[]) => ReactNode }

// The profile read loads after the entry (G-05: no generated SDK there).
const ByProfile = lazy(() => import('./nav-by-profile').then(module => ({ default: module.NavByProfile })))

/**
 * The nav's sections: all of them on the server, before hydration, while the profile loads and if it fails; then
 * without Achievements when the user turned gamification off (B-ACH-13). The profile read renders nothing beside the
 * items, so they stay mounted when it lands (a swapped tree would replace every link, focus included).
 */
export function NavSections({ session, workspace, render }: NavProps) {
  const [gamification, setGamification] = useState(true)
  const hydrated = useHydrated()
  return (
    <>
      {render(visibleSections(session, workspace, gamification))}
      {hydrated ? (
        <CatchBoundary getResetKey={() => session.user_id} errorComponent={() => null}>
          <Suspense fallback={null}>
            <ByProfile onGamification={setGamification} />
          </Suspense>
        </CatchBoundary>
      ) : null}
    </>
  )
}
