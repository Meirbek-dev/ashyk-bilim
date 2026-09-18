import type { Action, Resource, Scope } from '@/types/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'

type CanCheck = (resource: Resource, action: Action, scope: Scope) => boolean

export function canSeeCourses(can: CanCheck): boolean {
  return (
    can(Resources.COURSE, Actions.CREATE, Scopes.APP) ||
    can(Resources.COURSE, Actions.UPDATE, Scopes.APP) ||
    can(Resources.COURSE, Actions.UPDATE, Scopes.OWN) ||
    can(Resources.COURSE, Actions.MANAGE, Scopes.APP) ||
    can(Resources.ASSESSMENT, Actions.GRADE, Scopes.APP) ||
    can(Resources.ASSESSMENT, Actions.CREATE, Scopes.APP)
  )
}

export function canSeeAnalytics(can: CanCheck): boolean {
  return (
    can(Resources.ANALYTICS, Actions.READ, Scopes.ASSIGNED) ||
    can(Resources.ANALYTICS, Actions.READ, Scopes.APP) ||
    can(Resources.ANALYTICS, Actions.READ, Scopes.ALL) ||
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.ASSIGNED) ||
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.APP) ||
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.ALL)
  )
}

// The CSV exports are `analytics:export:*` only (UX-114): a read-only grant
// sees the dashboards but not the export buttons.
export function canExportAnalytics(can: CanCheck): boolean {
  return (
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.ASSIGNED) ||
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.APP) ||
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.ALL)
  )
}

// The users area holds the admin directory (`GET /users`, which the server
// gates on `platform:read:platform`) and the usergroups tab (`GET /usergroups`,
// `usergroup:read:platform`). It must NOT key off `user:read:platform` — every
// learner holds that grant, for reading public profiles, and would see the nav
// entry and land on a directory the server answers 403 for.
export function canSeeUsers(can: CanCheck): boolean {
  return (
    can(Resources.APP, Actions.READ, Scopes.APP) ||
    can(Resources.USER, Actions.UPDATE, Scopes.APP) ||
    can(Resources.USERGROUP, Actions.MANAGE, Scopes.APP) ||
    can(Resources.USERGROUP, Actions.READ, Scopes.APP)
  )
}

export function canSeeAdmin(can: CanCheck): boolean {
  return (
    can(Resources.APP, Actions.MANAGE, Scopes.OWN) ||
    can(Resources.APP, Actions.UPDATE, Scopes.OWN) ||
    can(Resources.APP, Actions.MANAGE, Scopes.APP) ||
    can(Resources.APP, Actions.UPDATE, Scopes.APP) ||
    can(Resources.ROLE, Actions.UPDATE, Scopes.APP) ||
    can(Resources.ROLE, Actions.READ, Scopes.APP)
  )
}

// The dashboard root is not teacher-only: it always renders the caller's own
// learner work queue (`GET /work`, which every authenticated role may read), so
// anyone who can submit work has something there. Gating this on the four
// admin-ish areas above hid the entry point from learners.
export function canAccessDashboard(can: CanCheck): boolean {
  return (
    canSeeCourses(can) ||
    canSeeAnalytics(can) ||
    canSeeUsers(can) ||
    canSeeAdmin(can) ||
    can(Resources.ASSESSMENT, Actions.SUBMIT, Scopes.ASSIGNED)
  )
}
