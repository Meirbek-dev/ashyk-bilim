import { Link as RouterLink } from '@tanstack/react-router'
import { lazy, Suspense, useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import type { Workspace } from '#/shared/auth/access'
import { Link } from '#/shared/components/link'
import { cookieItem } from '#/shared/lib/storage'

import { NavSections } from './nav-sections'

// A cookie, not localStorage: the shell renders on the server too, and the first paint must match.
const sidebarCookie = cookieItem('ab_sidebar', v.picklist(['expanded', 'collapsed']))

// The toggle is an IconButton (tooltip overlay) and the switch a menu: they load after the entry (budget G-05); SSR renders them.
const SidebarToggle = lazy(() => import('./sidebar-toggle').then(module => ({ default: module.SidebarToggle })))
const WorkspaceSwitch = lazy(() => import('./workspace-switch').then(module => ({ default: module.WorkspaceSwitch })))

/**
 * The rail from >= lg (DESIGN 6): the brand, the workspace switch, the workspace's sections and, at the foot, a strip of
 * the university's mark. Full height, in the theme's sidebar colours; collapsible to icons.
 */
export function SidebarNav({ session, workspace }: { session: SessionInfo; workspace: Workspace }) {
  const [collapsed, setCollapsed] = useState(() => sidebarCookie.get() === 'collapsed')
  const toggle = () => {
    sidebarCookie.set(collapsed ? 'expanded' : 'collapsed')
    setCollapsed(!collapsed)
  }
  return (
    <div
      className={`ab-rail hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block ${collapsed ? 'w-16' : 'w-64'}`}
    >
      <div className="sticky top-0 flex h-dvh flex-col gap-4 pb-3">
        {/* As tall as the utility bar beside it, so the wordmark and the search sit on one line. */}
        <div className="flex h-14 shrink-0 items-center px-3">
          <RouterLink
            to="/"
            className={`flex h-10 items-center rounded-md ${collapsed ? 'w-10 justify-center' : 'px-2'}`}
          >
            <span aria-hidden className={`ab-mark ${collapsed ? 'ab-mark-emblem h-7 w-7' : 'ab-mark-full h-8 w-24'}`} />
            <span className="sr-only">{m.platform_brand()}</span>
          </RouterLink>
        </div>
        {collapsed ? null : (
          <div className="mx-3 -mt-1 empty:hidden">
            <Suspense fallback={null}>
              <WorkspaceSwitch session={session} current={workspace.id} />
            </Suspense>
          </div>
        )}
        <nav aria-label={m.platform_nav_label()} className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-3">
          <NavSections
            session={session}
            workspace={workspace}
            render={sections =>
              sections.map(section => (
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
              ))
            }
          />
        </nav>
        {/* The foot: the university's mark and the toggle on one line. */}
        <div className={`mt-auto flex items-center px-3 ${collapsed ? 'justify-center' : 'justify-between pl-5'}`}>
          {collapsed ? null : (
            <div>
              <span aria-hidden className="ab-mark ab-mark-university block h-7 w-24" />
              <span className="sr-only">{m.platform_university()}</span>
            </div>
          )}
          <Suspense fallback={<span className="h-control w-control" />}>
            <SidebarToggle collapsed={collapsed} onToggle={toggle} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
