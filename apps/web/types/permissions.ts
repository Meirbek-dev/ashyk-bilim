// AUTO-GENERATED - do not edit manually.
// Run: python scripts/sync-permissions.py

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
} as const;

export type Action = (typeof Actions)[keyof typeof Actions];

export const Resources = {
  PLATFORM: 'platform',
  COURSE: 'course',
  CHAPTER: 'chapter',
  ACTIVITY: 'activity',
  ASSIGNMENT: 'assignment',
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
  API_TOKEN: 'api_token',
} as const;

export type Resource = (typeof Resources)[keyof typeof Resources];

export const Scopes = {
  ALL: 'all',
  OWN: 'own',
  ASSIGNED: 'assigned',
  PLATFORM: 'platform',
} as const;

export type Scope = (typeof Scopes)[keyof typeof Scopes];

export const RoleSlugs = {
  ADMIN: 'admin',
  MAINTAINER: 'maintainer',
  INSTRUCTOR: 'instructor',
  MODERATOR: 'moderator',
  USER: 'user',
} as const;

export type RoleSlug = (typeof RoleSlugs)[keyof typeof RoleSlugs];

// ============================================================================
// Types
// ============================================================================

/** Permission string format: "resource:action:scope" */
export type PermissionString = `${Resource}:${Action}:${Scope}`;

export interface Role {
  id: number;
  name: string;
  slug: string;
  description?: string;
  is_system: boolean;
  priority: number;
}

/** Canonical type for user RBAC data from the API. */
export interface UserRBACData {
  roles: Role[];
  permissions: string[];
}

/** Backend Permission entity. */
export interface Permission {
  id: number;
  name: string;
  resource_type: string;
  action: string;
  scope: string;
  description: string | null;
  created_at: string;
}

/** Role with its assigned permissions. */
export interface RoleWithPermissions extends Role {
  permissions: Permission[];
  permissions_count?: number;
  users_count?: number;
}

export interface RoleAuditEvent {
  timestamp: string;
  actor_id: number | null;
  action: string;
  target_role_id: number | null;
  target_role_slug: string | null;
  diff_summary: string | null;
}

export interface RoleAuditListResponse {
  items: RoleAuditEvent[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserBasic {
  id: number;
  user_uuid?: string;
  email: string;
  username: string;
  first_name?: string;
  last_name?: string;
  avatar_image?: string;
}

/** A user↔role assignment record. */
export interface UserRoleAssignment {
  user_id: number;
  role_id: number;
  assigned_at: string;
  assigned_by: number | null;
  user?: {
    id: number;
    user_uuid?: string;
    email: string;
    username: string;
    first_name?: string;
    last_name?: string;
    avatar_image?: string;
  };
  role?: Role;
}

/** Body for creating a role. */
export interface CreateRoleBody {
  name: string;
  slug: string;
  description?: string;
  priority?: number;
}

/** Body for updating a role. */
export interface UpdateRoleBody {
  name: string;
  slug?: string;
  description?: string;
  priority?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Build a permission string. Format: "resource:action:scope" */
export function perm(resource: Resource, action: Action, scope: Scope): PermissionString {
  return `${resource}:${action}:${scope}`;
}
