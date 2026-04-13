import type { Action, Resource, Scope } from '@/types/permissions';
import { Actions, Resources, Scopes } from '@/types/permissions';

type CanCheck = (resource: Resource, action: Action, scope: Scope) => boolean;

export function canSeePlatform(can: CanCheck): boolean {
  return (
    can(Resources.PLATFORM, Actions.MANAGE, Scopes.OWN) ||
    can(Resources.PLATFORM, Actions.UPDATE, Scopes.OWN) ||
    can(Resources.PLATFORM, Actions.MANAGE, Scopes.PLATFORM) ||
    can(Resources.PLATFORM, Actions.UPDATE, Scopes.PLATFORM)
  );
}

export function canSeeCourses(can: CanCheck): boolean {
  return (
    can(Resources.COURSE, Actions.CREATE, Scopes.PLATFORM) ||
    can(Resources.COURSE, Actions.UPDATE, Scopes.PLATFORM) ||
    can(Resources.COURSE, Actions.MANAGE, Scopes.PLATFORM)
  );
}

export function canSeeAssignments(can: CanCheck): boolean {
  return (
    can(Resources.COURSE, Actions.CREATE, Scopes.PLATFORM) ||
    can(Resources.COURSE, Actions.UPDATE, Scopes.PLATFORM) ||
    can(Resources.COURSE, Actions.UPDATE, Scopes.OWN) ||
    can(Resources.ASSIGNMENT, Actions.GRADE, Scopes.PLATFORM) ||
    can(Resources.ASSIGNMENT, Actions.CREATE, Scopes.PLATFORM)
  );
}

export function canSeeAnalytics(can: CanCheck): boolean {
  return (
    can(Resources.ANALYTICS, Actions.READ, Scopes.ASSIGNED) ||
    can(Resources.ANALYTICS, Actions.READ, Scopes.PLATFORM) ||
    can(Resources.ANALYTICS, Actions.READ, Scopes.ALL) ||
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.ASSIGNED) ||
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.PLATFORM) ||
    can(Resources.ANALYTICS, Actions.EXPORT, Scopes.ALL)
  );
}

export function canSeeUsers(can: CanCheck): boolean {
  return (
    can(Resources.USER, Actions.UPDATE, Scopes.PLATFORM) ||
    can(Resources.USER, Actions.READ, Scopes.PLATFORM) ||
    can(Resources.USERGROUP, Actions.MANAGE, Scopes.PLATFORM)
  );
}

export function canSeeAdmin(can: CanCheck): boolean {
  return (
    can(Resources.PLATFORM, Actions.MANAGE, Scopes.OWN) ||
    can(Resources.PLATFORM, Actions.UPDATE, Scopes.OWN) ||
    can(Resources.PLATFORM, Actions.MANAGE, Scopes.PLATFORM) ||
    can(Resources.PLATFORM, Actions.UPDATE, Scopes.PLATFORM) ||
    can(Resources.ROLE, Actions.UPDATE, Scopes.PLATFORM) ||
    can(Resources.ROLE, Actions.READ, Scopes.PLATFORM)
  );
}

export function canAccessDashboard(can: CanCheck): boolean {
  return (
    canSeePlatform(can) ||
    canSeeCourses(can) ||
    canSeeAssignments(can) ||
    canSeeAnalytics(can) ||
    canSeeUsers(can) ||
    canSeeAdmin(can)
  );
}
