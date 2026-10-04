import type { RegisteredRouter } from '@tanstack/react-router'
import {
  Award,
  BarChart3,
  BookOpen,
  Bot,
  CalendarCheck,
  GraduationCap,
  Inbox,
  Library,
  type LucideIcon,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
  UsersRound,
} from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { Capability, SessionInfo } from '#/shared/api/gen/types.gen'

// Spec 7.5: the single table "workspace -> section -> route -> capability". The route guards, the sidebar,
// the bottom bar, the workspace switcher and the command palette all read it: an item the user lacks the
// capability for exists nowhere. Capabilities are computed by the server (S-02); never derive them here.

/** A full route path of the app, checked against the route tree. */
export type AppPath = RegisteredRouter['routeTree']['types']['fileRouteTypes']['to']

/** A path without params: what a navigation item can point at. */
type NavPath = Exclude<AppPath, `${string}$${string}`>

export type Section = {
  /** The nav target; every route under this path belongs to the section. */
  to: NavPath
  label: () => string
  icon: LucideIcon
  /** Needed on top of the workspace's capability. */
  capability?: Capability
  /** Only this exact path, not the paths under it (an index that prefixes its siblings). */
  exact?: boolean
}

export type WorkspaceId = 'learn' | 'teach' | 'admin'

export type Workspace = {
  id: WorkspaceId
  label: () => string
  /** The URL prefix of the workspace; `learn` owns every signed-in path outside the others. */
  prefix: string
  capability?: Capability
  sections: readonly Section[]
}

const learn: Workspace = {
  id: 'learn',
  label: m.platform_workspace_learn,
  prefix: '/',
  sections: [
    { to: '/home', label: m.platform_nav_home, icon: CalendarCheck },
    { to: '/learning', label: m.platform_nav_learning, icon: GraduationCap },
    { to: '/courses', label: m.platform_nav_courses, icon: BookOpen },
    { to: '/collections', label: m.platform_nav_collections, icon: Library },
    { to: '/achievements', label: m.platform_nav_achievements, icon: Trophy },
  ],
}

export const workspaces: readonly Workspace[] = [
  learn,
  {
    id: 'teach',
    label: m.platform_workspace_teach,
    prefix: '/teach',
    capability: 'teach',
    sections: [
      { to: '/teach', label: m.platform_nav_inbox, icon: Inbox, exact: true },
      { to: '/teach/courses', label: m.platform_nav_teach_courses, icon: BookOpen },
      { to: '/teach/analytics', label: m.platform_nav_analytics, icon: BarChart3, capability: 'analytics.view' },
      { to: '/teach/groups', label: m.platform_nav_groups, icon: UsersRound, capability: 'groups.manage' },
    ],
  },
  {
    id: 'admin',
    label: m.platform_workspace_admin,
    prefix: '/admin',
    capability: 'admin',
    sections: [
      { to: '/admin/users', label: m.platform_nav_users, icon: Users, capability: 'admin.users' },
      { to: '/admin/roles', label: m.platform_nav_roles, icon: ShieldCheck, capability: 'admin.roles' },
      { to: '/admin/platform', label: m.platform_nav_platform, icon: Settings2, capability: 'admin.platform' },
      { to: '/admin/ai', label: m.platform_nav_ai, icon: Bot, capability: 'admin.ai' },
      { to: '/admin/gamification', label: m.platform_nav_gamification, icon: Award, capability: 'admin.gamification' },
      { to: '/admin/analytics', label: m.platform_nav_analytics, icon: BarChart3, capability: 'admin.analytics' },
    ],
  },
]

export function hasCapability(session: SessionInfo | null, capability: Capability): boolean {
  return session?.capabilities.includes(capability) ?? false
}

const under = (pathname: string, path: string) => path === '/' || pathname === path || pathname.startsWith(`${path}/`)

/** The workspace a path belongs to: the longest matching prefix. */
export function workspaceOf(pathname: string): Workspace {
  return workspaces.reduce((best, workspace) =>
    under(pathname, workspace.prefix) && workspace.prefix.length > best.prefix.length ? workspace : best,
  )
}

/** The workspace the shell shows on a path: the path's own, or Learn when the user cannot open it (a 403 page). */
export function shellWorkspace(session: SessionInfo | null, pathname: string): Workspace {
  const own = workspaceOf(pathname)
  return own.capability === undefined || hasCapability(session, own.capability) ? own : learn
}

/** The capabilities a signed-in path needs: its workspace's, then its section's. Empty = any session. */
export function requiredCapabilities(pathname: string): Capability[] {
  const workspace = workspaceOf(pathname)
  const section = workspace.sections
    .filter(entry => (entry.exact ? pathname === entry.to : under(pathname, entry.to)))
    .reduce<Section | undefined>((best, entry) => (best && best.to.length > entry.to.length ? best : entry), undefined)
  return [workspace.capability, section?.capability].filter(capability => capability !== undefined)
}

const allowed = (session: SessionInfo | null, item: { capability?: Capability }) =>
  item.capability === undefined || hasCapability(session, item.capability)

/** The workspaces a signed-in user can open; the switcher shows only when there is more than one. */
export const availableWorkspaces = (session: SessionInfo | null): Workspace[] =>
  session ? workspaces.filter(workspace => allowed(session, workspace)) : []

/** A workspace's sections the user may open, in table order. */
export const visibleSections = (session: SessionInfo | null, workspace: Workspace): Section[] =>
  allowed(session, workspace) ? workspace.sections.filter(section => allowed(session, section)) : []

const forbidden = () =>
  new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })

type AccessInput = { context: { session: SessionInfo | null }; location: { pathname: string } }

/** beforeLoad of a workspace layout: a missing capability renders "no access" in place (403, same URL). */
export function requireCapability({ context, location }: AccessInput): void {
  if (!requiredCapabilities(location.pathname).every(capability => hasCapability(context.session, capability))) {
    throw forbidden()
  }
}

/** The landing path of a workspace: its first section the user may open (a 403 when there is none). */
export function workspaceHome(session: SessionInfo | null, id: WorkspaceId): NavPath {
  const workspace = workspaces.find(entry => entry.id === id)
  const first = workspace ? visibleSections(session, workspace)[0] : undefined
  if (!first) throw forbidden()
  return first.to
}
