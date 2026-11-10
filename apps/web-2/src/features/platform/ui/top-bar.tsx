import { lazy, Suspense } from 'react'
import { Link as RouterLink, useLocation } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import type { WorkspaceId } from '#/shared/auth/access'
import { returnTo } from '#/shared/auth/redirect'
import { BrandMark } from '#/shared/components/brand-mark'
import { buttonVariants } from '#/shared/components/button-variants'
import { UniversityMark } from '#/shared/components/university-mark'

import { shellSlots } from './shell-slots'

// The menus (base-ui overlays, floating positioning) are not needed for the first paint: SSR renders them, the
// browser hydrates them when their chunk arrives. This keeps the entry chunk inside its budget (G-05).
const ProfileMenu = lazy(() => import('./profile-menu').then(module => ({ default: module.ProfileMenu })))
const GuestSwitches = lazy(() => import('./guest-switches').then(module => ({ default: module.GuestSwitches })))

/**
 * The utility bar over the page. Signed in: search, conversations, notifications, profile (the brand and the workspace live on the
 * rail from lg; below it the mark stays here). Guests: the wordmark, the university's mark and the public links, then
 * sign-in actions.
 */
export function TopBar({ session, workspace }: { session: SessionInfo | null; workspace: WorkspaceId }) {
  const Search = shellSlots.search
  const Notifications = shellSlots.notifications
  const Messages = shellSlots.messages
  // «Войти» on a course, a collection or a search comes back there after sign-in (B-AUTH-17), not to /home. Path and
  // query only: the server never sees the hash (#main after the skip link), so with it the link would not hydrate.
  const back = returnTo(useLocation({ select: location => location.pathname + location.searchStr }))
  return (
    <header className={`sticky top-0 z-30 shrink-0 bg-background ${session ? '' : 'border-b'}`}>
      <div className={`mx-auto flex h-14 items-center gap-2 px-2 ${session ? 'md:px-6' : 'max-w-6xl md:px-8'}`}>
        <RouterLink
          to="/"
          className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1 ${session ? 'lg:hidden' : 'md:-ml-2'}`}
        >
          <BrandMark className="h-8 w-auto sm:hidden" />
          <BrandMark full className="hidden h-8 w-auto sm:inline-flex" />
          <span className="sr-only">{m.platform_brand()}</span>
        </RouterLink>
        {session ? null : (
          <>
            <span aria-hidden className="mx-2 hidden h-6 border-l xl:block" />
            <UniversityMark className="mr-4 hidden h-7 shrink-0 xl:inline-flex" />
            <nav aria-label={m.platform_nav_label()} className="hidden items-center gap-1 md:flex">
              <RouterLink to="/courses" className={buttonVariants({ variant: 'ghost' })}>
                {m.platform_nav_courses()}
              </RouterLink>
              <RouterLink to="/collections" className={buttonVariants({ variant: 'ghost' })}>
                {m.platform_nav_collections()}
              </RouterLink>
            </nav>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {Search ? <Search /> : null}
          {session && Messages ? <Messages /> : null}
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
                <RouterLink to="/signup" search={back} className={buttonVariants({ variant: 'default' })}>
                  {m.platform_nav_signup()}
                </RouterLink>
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
