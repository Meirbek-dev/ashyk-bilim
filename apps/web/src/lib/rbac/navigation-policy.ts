import type { Action, Resource, Scope } from '@/types/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'

type CanCheck = (resource: Resource, action: Action, scope: Scope) => boolean

export function canSeePlatform(can: CanCheck): boolean {
  return (
    can(Resources.APP, Actions.MANAGE, Scopes.OWN) ||
    can(Resources.APP, Actions.UPDATE, Scopes.OWN) ||
    can(Resources.APP, Actions.MANAGE, Scopes.APP) ||
    can(Resources.APP, Actions.UPDATE, Scopes.APP)
  )
}

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

export function canSeeUsers(can: CanCheck): boolean {
  return (
    can(Resources.USER, Actions.UPDATE, Scopes.APP) ||
    can(Resources.USER, Actions.READ, Scopes.APP) ||
    can(Resources.USERGROUP, Actions.MANAGE, Scopes.APP)
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

export function canAccessDashboard(can: CanCheck): boolean {
  return canSeePlatform(can) || canSeeCourses(can) || canSeeAnalytics(can) || canSeeUsers(can) || canSeeAdmin(can)
}
