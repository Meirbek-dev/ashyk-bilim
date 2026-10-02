import { lazy, Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import type { WorkspaceId } from '#/shared/auth/access'
import { Link } from '#/shared/ui/link'

import { shellSlots } from './shell-slots'

// The menus (base-ui overlays, floating positioning) are not needed for the first paint: SSR renders them, the
// browser hydrates them when their chunk arrives. This keeps the entry chunk inside its budget (G-05).
const ProfileMenu = lazy(() => import('./profile-menu').then(module => ({ default: module.ProfileMenu })))
const WorkspaceSwitch = lazy(() => import('./workspace-switch').then(module => ({ default: module.WorkspaceSwitch })))
const GuestSwitches = lazy(() => import('./guest-switches').then(module => ({ default: module.GuestSwitches })))

/** Brand, workspace switch (desktop), then the slots and the profile menu; guests get sign-in actions. */
export function TopBar({ session, workspace }: { session: SessionInfo | null; workspace: WorkspaceId }) {
  const Search = shellSlots.search
  const Notifications = shellSlots.notifications
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 md:px-4">
      <Link to="/" variant="ghost">
        {m.platform_brand()}
      </Link>
      {session ? (
        <div className="hidden lg:block">
          <Suspense fallback={null}>
            <WorkspaceSwitch session={session} current={workspace} />
          </Suspense>
        </div>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        {Search ? <Search /> : null}
        {session && Notifications ? <Notifications /> : null}
        {session ? (
          <Suspense fallback={null}>
            <ProfileMenu session={session} current={workspace} />
          </Suspense>
        ) : (
          <>
            <Suspense fallback={null}>
              <GuestSwitches />
            </Suspense>
            <Link to="/login" variant="ghost">
              {m.platform_nav_login()}
            </Link>
            <span className="hidden sm:flex">
              <Link to="/signup" variant="outline">
                {m.platform_nav_signup()}
              </Link>
            </span>
          </>
        )}
      </div>
    </header>
  )
}
