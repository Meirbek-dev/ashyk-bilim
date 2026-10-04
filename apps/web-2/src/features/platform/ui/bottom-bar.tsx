import { lazy, Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import type { Section, Workspace } from '#/shared/auth/access'
import { Link } from '#/shared/components/link'

import { NavSections } from './nav-sections'

const MAX_ITEMS = 5

// The overflow menu is an overlay: it loads after the entry (budget G-05); SSR still renders its trigger.
const MoreMenu = lazy(() => import('./more-menu').then(module => ({ default: module.MoreMenu })))

/** The workspace navigation below lg (DESIGN 6): at most 5 items, icon plus label; the rest under "More". */
export function BottomBar({ session, workspace }: { session: SessionInfo; workspace: Workspace }) {
  return (
    <nav
      aria-label={m.platform_nav_label()}
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch gap-1 border-t bg-sidebar px-2 py-0.5 text-sidebar-foreground lg:hidden"
    >
      <NavSections session={session} workspace={workspace} render={barItems} />
    </nav>
  )
}

function barItems(sections: Section[]) {
  const shown = sections.length > MAX_ITEMS ? sections.slice(0, MAX_ITEMS - 1) : sections
  const rest = sections.slice(shown.length)
  return (
    <>
      {shown.map(section => (
        <Link key={section.to} variant="bar" to={section.to} activeOptions={{ exact: section.exact === true }}>
          <section.icon aria-hidden />
          <span className="line-clamp-2">{section.label()}</span>
        </Link>
      ))}
      {rest.length > 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Suspense fallback={null}>
            <MoreMenu sections={rest} />
          </Suspense>
        </div>
      ) : null}
    </>
  )
}
