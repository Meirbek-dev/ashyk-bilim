import type { Action, Resource, Scope } from '@/types/permissions'
import type { CourseWorkspaceStage } from '@/lib/course-management'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { getCourseMetadata } from '@services/courses/courses'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'
import { redirect } from '@/i18n/navigation'
import { getLocale } from 'next-intl/server'

export interface CourseWorkspaceCapabilities {
  canViewWorkspace: boolean
  canCreateCourse: boolean
  canEditDetails: boolean
  canEditCurriculum: boolean
  canManageAccess: boolean
  canManageCollaboration: boolean
  canManageSettings: boolean
  canManageCertificate: boolean
  canReviewCourse: boolean
  canDeleteCourse: boolean
}

type AuthSession = Awaited<ReturnType<typeof requireSession>>

/**
 * `sessionCan` only recognizes a bare `*` as the all-access wildcard, but the
 * server's actual super-admin grant is the literal string `*:*:*` (confirmed
 * via `POST /auth/login` as admin@ashyq.local — `permissions: ["*:*:*"]`).
 * Handled locally until `@/lib/auth/permissions.ts` matches the real grant
 * (see handoff); `Users.tsx` and `session-provider.tsx` work around the same
 * gap with their own `.includes('*:*:*')` checks.
 */
const SUPER_ADMIN_GRANT = '*:*:*'

function can(session: AuthSession, permsSet: Set<string>, resource: Resource, action: Action, scope: Scope) {
  return permsSet.has(SUPER_ADMIN_GRANT) || sessionCan(session, resource, action, scope, permsSet)
}

/**
 * An `:own`-scoped grant (`course:update:own`, `chapter:update:own`, …) only
 * covers courses the session user created; a `:platform`-scoped grant covers
 * every course. Mirrors the scope resolution in
 * `apps/server/crates/core/src/permission.rs` (`Grant::grants`) — scopes are
 * matched exactly, the caller ORs `platform` with ownership+`own` itself.
 */
function canOwnOrPlatform(
  session: AuthSession,
  permsSet: Set<string>,
  isCreator: boolean,
  resource: Resource,
  action: Action,
) {
  return can(session, permsSet, resource, action, Scopes.APP) || (isCreator && can(session, permsSet, resource, action, Scopes.OWN))
}

function hasCreateCoursePermission(session: AuthSession, permsSet: Set<string>) {
  return can(session, permsSet, Resources.COURSE, Actions.CREATE, Scopes.APP)
}

function deriveCourseWorkspaceCapabilities(session: AuthSession, course: AppCourse): CourseWorkspaceCapabilities {
  const permsSet = new Set(session.permissions)
  const isCreator = typeof course.creator_id === 'string' && course.creator_id === session.userId

  const canEditDetails = canOwnOrPlatform(session, permsSet, isCreator, Resources.COURSE, Actions.UPDATE)
  const canEditCurriculum =
    canOwnOrPlatform(session, permsSet, isCreator, Resources.CHAPTER, Actions.UPDATE) ||
    canOwnOrPlatform(session, permsSet, isCreator, Resources.ACTIVITY, Actions.UPDATE)
  const canManage = canOwnOrPlatform(session, permsSet, isCreator, Resources.COURSE, Actions.MANAGE)
  const canManageAccess = canManage
  const canManageCollaboration = canManage
  const canManageSettings = canManageAccess || canManageCollaboration
  const canManageCertificate = can(session, permsSet, Resources.CERTIFICATE, Actions.CREATE, Scopes.APP)
  const canDeleteCourse = canOwnOrPlatform(session, permsSet, isCreator, Resources.COURSE, Actions.DELETE)
  const canReviewCourse = canEditDetails || canEditCurriculum || canManageAccess || canManageCertificate

  return {
    canViewWorkspace: canReviewCourse || canManageSettings,
    canCreateCourse: hasCreateCoursePermission(session, permsSet),
    canEditDetails,
    canEditCurriculum,
    canManageAccess,
    canManageCollaboration,
    canManageSettings,
    canManageCertificate,
    canReviewCourse,
    canDeleteCourse,
  }
}

export async function getCourseWorkspaceCapabilitiesForCourse(
  courseuuid: string,
): Promise<CourseWorkspaceCapabilities> {
  const [session, course] = await Promise.all([requireSession(), getCourseMetadata(courseuuid)])

  const capabilities = deriveCourseWorkspaceCapabilities(session, course)

  if (!capabilities.canViewWorkspace) {
    const locale = await getLocale()
    redirect({ href: '/unauthorized', locale })
  }

  return capabilities
}

export async function requireCourseWorkspaceStageAccess(
  courseuuid: string,
  stage: CourseWorkspaceStage,
): Promise<CourseWorkspaceCapabilities> {
  const capabilities = await getCourseWorkspaceCapabilitiesForCourse(courseuuid)

  const allowedByStage: Record<CourseWorkspaceStage, boolean> = {
    overview: capabilities.canViewWorkspace,
    details: capabilities.canEditDetails,
    curriculum: capabilities.canEditCurriculum,
    gradebook: capabilities.canReviewCourse,
    access: capabilities.canManageSettings,
    collaboration: capabilities.canManageCollaboration,
    certificate: capabilities.canManageCertificate,
    review: capabilities.canReviewCourse,
  }

  if (!allowedByStage[stage]) {
    const locale = await getLocale()
    redirect({ href: '/unauthorized', locale })
  }

  return capabilities
}
