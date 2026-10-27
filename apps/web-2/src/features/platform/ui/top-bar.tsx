import { lazy, Suspense } from 'react'
import { Link as RouterLink, useLocation } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import type { WorkspaceId } from '#/shared/auth/access'
import { returnTo } from '#/shared/auth/redirect'
import { BrandMark } from '#/shared/components/brand-mark'
import { buttonVariants } from '#/shared/components/button-variants'

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
  // «Войти» on a course, a collection or a search comes back there after sign-in (B-AUTH-17), not to /home.
  const back = returnTo(useLocation({ select: location => location.href }))
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 md:px-4">
      <RouterLink
        to="/"
        className="flex items-center gap-2 rounded-md px-2 py-1 font-heading text-lg font-semibold whitespace-nowrap"
      >
        <BrandMark className="h-8 w-auto sm:hidden" />
        <BrandMark full className="hidden h-8 w-auto sm:inline-flex" />
        <span className="sr-only">{m.platform_brand()}</span>
      </RouterLink>
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
            <RouterLink to="/login" search={back} className={buttonVariants({ variant: 'ghost' })}>
              {m.platform_nav_login()}
            </RouterLink>
            <span className="hidden sm:flex">
              <RouterLink to="/signup" search={back} className={buttonVariants({ variant: 'outline' })}>
                {m.platform_nav_signup()}
              </RouterLink>
            </span>
          </>
        )}
      </div>
    </header>
  )
}
