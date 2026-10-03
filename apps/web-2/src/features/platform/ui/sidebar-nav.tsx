import { lazy, Suspense, useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import { visibleSections, type Workspace } from '#/shared/auth/access'
import { Link } from '#/shared/components/link'
import { cookieItem } from '#/shared/lib/storage'

// A cookie, not localStorage: the shell renders on the server too, and the first paint must match.
const sidebarCookie = cookieItem('ab_sidebar', v.picklist(['expanded', 'collapsed']))

// The toggle is an IconButton (tooltip overlay): it loads after the entry (budget G-05); SSR renders it.
const SidebarToggle = lazy(() => import('./sidebar-toggle').then(module => ({ default: module.SidebarToggle })))

/** The current workspace's navigation from >= lg (DESIGN 6): w-60, collapsible to icons. */
export function SidebarNav({ session, workspace }: { session: SessionInfo; workspace: Workspace }) {
  const [collapsed, setCollapsed] = useState(() => sidebarCookie.get() === 'collapsed')
  const toggle = () => {
    sidebarCookie.set(collapsed ? 'expanded' : 'collapsed')
    setCollapsed(!collapsed)
  }
  return (
    <nav
      aria-label={m.platform_nav_label()}
      className={`hidden shrink-0 border-r bg-sidebar text-sidebar-foreground lg:block ${collapsed ? 'w-14' : 'w-60'}`}
    >
      <div className="sticky top-14 flex flex-col gap-1 p-2">
        <div className={`flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
          <Suspense fallback={<span className="h-control w-control" />}>
            <SidebarToggle collapsed={collapsed} onToggle={toggle} />
          </Suspense>
        </div>
        {visibleSections(session, workspace).map(section => (
          <Link
            key={section.to}
            variant="nav"
            to={section.to}
            activeOptions={{ exact: section.exact === true }}
            title={collapsed ? section.label() : undefined}
          >
            <section.icon aria-hidden />
            <span className={collapsed ? 'sr-only' : 'truncate'}>{section.label()}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
