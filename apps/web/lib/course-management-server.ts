import type { CourseWorkspaceStage } from '@/lib/course-management';
import { Actions, Resources, Scopes } from '@/types/permissions';
import { getCourseUserRights } from '@services/courses/courses';
import { requireSession } from '@/lib/auth/session';
import { sessionCan } from '@/lib/auth/permissions';
import { cleanCourseUuid } from '@/lib/course-management';
import { redirect } from 'next/navigation';

export interface CourseWorkspaceCapabilities {
  canViewWorkspace: boolean;
  canCreateCourse: boolean;
  canEditDetails: boolean;
  canEditCurriculum: boolean;
  canManageAccess: boolean;
  canManageCollaboration: boolean;
  canManageSettings: boolean;
  canManageCertificate: boolean;
  canReviewCourse: boolean;
  canDeleteCourse: boolean;
}

function hasCreateCoursePermission(session: any) {
  return sessionCan(session, Resources.COURSE, Actions.CREATE, Scopes.PLATFORM);
}

interface CourseRightsResponse {
  permissions?: {
    read?: boolean;
    update?: boolean;
    delete?: boolean;
    update_content?: boolean;
    manage_contributors?: boolean;
    manage_access?: boolean;
    create_certifications?: boolean;
  };
}

function mapCourseRightsToCapabilities(session: any, rights: CourseRightsResponse): CourseWorkspaceCapabilities {
  const canEditDetails = Boolean(rights.permissions?.update);
  const canEditCurriculum = Boolean(rights.permissions?.update_content ?? rights.permissions?.update);
  const canManageAccess = Boolean(rights.permissions?.manage_access);
  const canManageCollaboration = Boolean(rights.permissions?.manage_contributors);
  const canManageSettings = canManageAccess || canManageCollaboration;
  const canManageCertificate = Boolean(rights.permissions?.create_certifications);
  const canDeleteCourse = Boolean(rights.permissions?.delete);
  const canReviewCourse = canEditDetails || canEditCurriculum || canManageAccess || canManageCertificate;

  return {
    canViewWorkspace: canReviewCourse || canManageSettings,
    canCreateCourse: hasCreateCoursePermission(session),
    canEditDetails,
    canEditCurriculum,
    canManageAccess,
    canManageCollaboration,
    canManageSettings,
    canManageCertificate,
    canReviewCourse,
    canDeleteCourse,
  };
}

export async function getCourseWorkspaceCapabilitiesForCourse(
  courseuuid: string,
): Promise<CourseWorkspaceCapabilities> {
  const session = await requireSession();

  const rights = (await getCourseUserRights(`course_${cleanCourseUuid(courseuuid)}`)) as CourseRightsResponse;
  const capabilities = mapCourseRightsToCapabilities(session, rights);

  if (!capabilities.canViewWorkspace) {
    redirect('/unauthorized');
  }

  return capabilities;
}

export async function requireCourseWorkspaceStageAccess(
  courseuuid: string,
  stage: CourseWorkspaceStage,
): Promise<CourseWorkspaceCapabilities> {
  const capabilities = await getCourseWorkspaceCapabilitiesForCourse(courseuuid);

  const allowedByStage: Record<CourseWorkspaceStage, boolean> = {
    overview: capabilities.canViewWorkspace,
    details: capabilities.canEditDetails,
    curriculum: capabilities.canEditCurriculum,
    gradebook: capabilities.canReviewCourse,
    access: capabilities.canManageSettings,
    collaboration: capabilities.canManageCollaboration,
    certificate: capabilities.canManageCertificate,
    review: capabilities.canReviewCourse,
  };

  if (!allowedByStage[stage]) {
    redirect('/unauthorized');
  }

  return capabilities;
}
