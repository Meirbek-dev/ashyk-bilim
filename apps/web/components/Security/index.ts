/**
 * RBAC Security Components - canonical barrel export.
 *
 * All permission-related imports should come from this module.
 */

// UI Components
export { PermissionGuard, PermissionErrorBoundary } from './PermissionGuard';

// Re-export types and constants from permissions for convenience
export type { Action, Resource, Scope, Role, PermissionString } from '@/types/permissions';
export { Actions, Resources, Scopes, RoleSlugs, perm } from '@/types/permissions';
