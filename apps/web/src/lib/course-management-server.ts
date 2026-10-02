import type { Action, Resource, Scope } from '@/types/permissions'
import { isCourseArchived, isCourseAuthor } from '@/lib/course-management'
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
  /** Archive / restore (COURSE_ARCHIVING 6.2): platform course manager or an author. */
  canArchiveCourse: boolean
  /** Archived courses are read-only: every `canEdit*` / `canManage*` above is off. */
  isArchived: boolean
  /** Which workspace tabs the viewer may open; an archived course keeps them readable. */
  stages: Record<CourseWorkspaceStage, boolean>
}

type AuthSession = Awaited<ReturnType<typeof requireSession>>

function can(session: AuthSession, permsSet: Set<string>, resource: Resource, action: Action, scope: Scope) {
  return sessionCan(session, resource, action, scope, permsSet)
}

/**
 * Authorship IS the `:own` scope: the creator and every active maintainer /
 * contributor (`isCourseAuthor`, `contributor_ids` on the wire) write on the
 * course without any role grant - a plain `user`-role co-author edits like
 * the creator; a `:platform`-scoped grant covers every course. Mirrors
 * `CoursesService::require_write` / `AssessmentsService::require_scoped` in
 * `apps/server/crates/domain`.
 */
function canOwnOrPlatform(
  session: AuthSession,
  permsSet: Set<string>,
  isAuthor: boolean,
  resource: Resource,
  action: Action,
) {
  return isAuthor || can(session, permsSet, resource, action, Scopes.APP)
}

function hasCreateCoursePermission(session: AuthSession, permsSet: Set<string>) {
  return can(session, permsSet, Resources.COURSE, Actions.CREATE, Scopes.APP)
}

export function deriveCourseWorkspaceCapabilities(
  session: AuthSession,
  course: AppCourse,
): CourseWorkspaceCapabilities {
  const permsSet = new Set(session.permissions)
  const isCreator = typeof course.creator_id === 'string' && course.creator_id === session.userId
  const isAuthor = isCourseAuthor(course, session.userId)

  const canEditDetails = canOwnOrPlatform(session, permsSet, isAuthor, Resources.COURSE, Actions.UPDATE)
  const canEditCurriculum =
    canOwnOrPlatform(session, permsSet, isAuthor, Resources.CHAPTER, Actions.UPDATE) ||
    canOwnOrPlatform(session, permsSet, isAuthor, Resources.ACTIVITY, Actions.UPDATE)
  const canManage = canOwnOrPlatform(session, permsSet, isAuthor, Resources.COURSE, Actions.MANAGE)
  const canManageAccess = canManage
  // The roster is managed by the creator, an active maintainer or a platform
  // manager; the page itself is readable by every author (the server 403s
  // the mutations for plain contributors).
  const canManageCollaboration = canManage || isAuthor
  const canManageSettings = canManageAccess || canManageCollaboration
  const canManageCertificate = canOwnOrPlatform(session, permsSet, isAuthor, Resources.CERTIFICATE, Actions.CREATE)
  // Delete stays creator-only on the server.
  const canDeleteCourse = canOwnOrPlatform(session, permsSet, isCreator, Resources.COURSE, Actions.DELETE)
  // Gradebook / review need the server's grading gate (`assessment:grade` platform
  // or authorship). UX-258: the instructor role's `certificate:create:platform`
  // is not course access - it used to open the workspace of every course.
  const canGrade = canOwnOrPlatform(session, permsSet, isAuthor, Resources.ASSESSMENT, Actions.GRADE)
  const canReviewCourse = canEditDetails || canEditCurriculum || canManageAccess || canGrade

  const stages: Record<CourseWorkspaceStage, boolean> = {
    overview: canReviewCourse || canManageSettings,
    details: canEditDetails,
    curriculum: canEditCurriculum,
    gradebook: canReviewCourse,
    access: canManageSettings,
    collaboration: canManageCollaboration,
    certificate: canManageCertificate,
    review: canReviewCourse,
  }
  // The server's roster-manager gate (creator, active maintainer, platform
  // manager): the course payload carries no roster roles, so a plain
  // contributor sees the item and gets the server's 403 - as with publish.
  const canArchiveCourse = canManage
  // Archived: frozen for every role (writes answer 409 `course-archived`);
  // the tabs stay open for reading, the gradebook for export.
  const isArchived = isCourseArchived(course)

  return {
    canViewWorkspace: stages.overview,
    canCreateCourse: hasCreateCoursePermission(session, permsSet),
    canEditDetails: canEditDetails && !isArchived,
    canEditCurriculum: canEditCurriculum && !isArchived,
    canManageAccess: canManageAccess && !isArchived,
    canManageCollaboration: canManageCollaboration && !isArchived,
    canManageSettings: canManageSettings && !isArchived,
    canManageCertificate: canManageCertificate && !isArchived,
    canReviewCourse,
    canDeleteCourse,
    canArchiveCourse,
    isArchived,
    stages,
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

  if (!capabilities.stages[stage]) {
    const locale = await getLocale()
    redirect({ href: '/unauthorized', locale })
  }

  return capabilities
}
