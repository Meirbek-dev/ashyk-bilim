/**
 * Permission types - single source of truth for the frontend RBAC system.
 *
 * Constants use lowercase values to match the backend format directly.
 * No toLowerCase() conversion needed at check time.
 */

// ============================================================================
// Constants
// ============================================================================

export const Actions = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  MANAGE: 'manage',
  MODERATE: 'moderate',
  EXPORT: 'export',
  GRADE: 'grade',
  SUBMIT: 'submit',
  ENROLL: 'enroll',
} as const

export type Action = (typeof Actions)[keyof typeof Actions]

export const Resources = {
  APP: 'platform',
  COURSE: 'course',
  CHAPTER: 'chapter',
  ACTIVITY: 'activity',
  QUIZ: 'quiz',
  USER: 'user',
  USERGROUP: 'usergroup',
  COLLECTION: 'collection',
  ROLE: 'role',
  CERTIFICATE: 'certificate',
  DISCUSSION: 'discussion',
  FILE: 'file',
  ANALYTICS: 'analytics',
  TRAIL: 'trail',
  EXAM: 'exam',
  ASSESSMENT: 'assessment',
  API_TOKEN: 'api_token',
} as const

export type Resource = (typeof Resources)[keyof typeof Resources]

export const Scopes = {
  ALL: 'all',
  OWN: 'own',
  ASSIGNED: 'assigned',
  APP: 'platform',
} as const

export type Scope = (typeof Scopes)[keyof typeof Scopes]

export const RoleSlugs = {
  ADMIN: 'admin',
  MAINTAINER: 'maintainer',
  INSTRUCTOR: 'instructor',
  MODERATOR: 'moderator',
  USER: 'user',
} as const

export type RoleSlug = (typeof RoleSlugs)[keyof typeof RoleSlugs]

// ============================================================================
// Types
// ============================================================================

/** Permission string format: "resource:action:scope" */
export type PermissionString = `${Resource}:${Action}:${Scope}`

/** `resource:action[:scope]`, each segment a lowercase identifier or `*` (matches the server registry). */
export const GRANT_PATTERN = /^([a-z][a-z0-9_]*|\*):([a-z][a-z0-9_]*|\*)(?::([a-z][a-z0-9_]*|\*))?$/

// ============================================================================
// Helpers
// ============================================================================

/** Build a permission string. Format: "resource:action:scope" */
export function perm(resource: Resource, action: Action, scope: Scope): PermissionString {
  return `${resource}:${action}:${scope}`
}

/** Grant vocabulary the permission picker offers (`resource:action:scope`). */
export const KNOWN_GRANTS: readonly PermissionString[] = Object.values(Resources).flatMap(resource =>
  Object.values(Actions).flatMap(action => Object.values(Scopes).map(scope => perm(resource, action, scope))),
)
