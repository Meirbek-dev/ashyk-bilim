import type { CourseEditorBundle } from '@services/courses/editor';

export type CourseWorkspaceStage =
  | 'overview'
  | 'details'
  | 'curriculum'
  | 'gradebook'
  | 'access'
  | 'collaboration'
  | 'certificate'
  | 'review';

export type CourseReadinessItemId = 'details' | 'media' | 'curriculum' | 'collaboration' | 'access' | 'certificate';

export type CourseManagementBadgeId = 'public' | 'private' | 'readyToPublish' | 'needsAttention' | 'noActivitiesYet';

export interface CourseChecklistItem {
  id: CourseReadinessItemId;
  complete: boolean;
  href?: CourseWorkspaceStage;
}

export function cleanCourseUuid(courseUuid: string): string {
  return courseUuid.replace(/^course_/, '');
}

export function cleanActivityUuid(activityUuid: string): string {
  return activityUuid.replace(/^activity_/, '');
}

export function prefixedCourseUuid(courseUuid: string): string {
  return courseUuid.startsWith('course_') ? courseUuid : `course_${courseUuid}`;
}

export function buildCourseWorkspacePath(courseUuid: string, stage: CourseWorkspaceStage = 'curriculum'): string {
  const cleanUuid = cleanCourseUuid(courseUuid);
  return stage === 'overview' ? `/dash/courses/${cleanUuid}/curriculum` : `/dash/courses/${cleanUuid}/${stage}`;
}

export function buildCourseCreationPath(sourceCourseUuid?: string): string {
  const query = sourceCourseUuid ? `?tpl=outline&src=${cleanCourseUuid(sourceCourseUuid)}` : '';
  return `/dash/courses/new${query}`;
}

export function getCourseContentStats(course: any): { chapters: number; activities: number } {
  const chapters = Array.isArray(course?.chapters) ? course.chapters.length : 0;
  const activities = Array.isArray(course?.chapters)
    ? course.chapters.reduce(
        (total: number, chapter: any) => total + (Array.isArray(chapter.activities) ? chapter.activities.length : 0),
        0,
      )
    : 0;

  return { chapters, activities };
}

const isCourseDetailsComplete = (course: any): boolean => Boolean(course?.name?.trim() && course?.description?.trim());

const isCourseMediaComplete = (course: any): boolean => Boolean(course?.thumbnail_image);

const isCourseCurriculumComplete = (stats: { chapters: number; activities: number }): boolean =>
  stats.chapters > 0 && stats.activities > 0;

const isCourseCollaborationComplete = (contributors: any[]): boolean =>
  Array.isArray(contributors) && contributors.length > 0;

const isCourseAccessComplete = (course: any, linkedUserGroups: any[]): boolean =>
  course?.public === true || (course?.public === false && linkedUserGroups.length > 0);

const isCourseCertificateComplete = (certifications: any[]): boolean => certifications.length > 0;

export function getCourseReadinessChecklist(
  course: any,
  editorData?: CourseEditorBundle | null,
): CourseChecklistItem[] {
  const stats = getCourseContentStats(course);
  const contributors = editorData?.contributors?.data ?? course?.authors ?? [];
  const certifications = editorData?.certifications?.data ?? [];
  const linkedUserGroups = editorData?.linkedUserGroups?.data ?? [];

  return [
    {
      id: 'details',
      complete: isCourseDetailsComplete(course),
      href: 'details',
    },
    {
      id: 'media',
      complete: isCourseMediaComplete(course),
      href: 'details',
    },
    {
      id: 'curriculum',
      complete: isCourseCurriculumComplete(stats),
      href: 'curriculum',
    },
    {
      id: 'collaboration',
      complete: isCourseCollaborationComplete(contributors),
      href: 'collaboration',
    },
    {
      id: 'access',
      complete: isCourseAccessComplete(course, linkedUserGroups),
      href: 'access',
    },
    {
      id: 'certificate',
      complete: isCourseCertificateComplete(certifications),
      href: 'certificate',
    },
  ];
}

export function getCourseReadinessSummary(course: any, editorData?: CourseEditorBundle | null) {
  const checklist = getCourseReadinessChecklist(course, editorData);
  const completed = checklist.filter((item) => item.complete).length;
  const issues = checklist.filter((item) => !item.complete);

  return {
    checklist,
    completed,
    total: checklist.length,
    readyToPublish: issues.length === 0,
    issues,
  };
}

export function getCourseManagementBadges(
  course: any,
  editorData?: CourseEditorBundle | null,
): CourseManagementBadgeId[] {
  const summary = getCourseReadinessSummary(course, editorData);
  const stats = getCourseContentStats(course);
  const badges: CourseManagementBadgeId[] = [];

  badges.push(course?.public ? 'public' : 'private');

  if (summary.readyToPublish) {
    badges.push('readyToPublish');
  } else if (summary.issues.length > 0) {
    badges.push('needsAttention');
  }

  if (stats.activities === 0) {
    badges.push('noActivitiesYet');
  }

  return badges;
}

export function courseNeedsAttention(course: any): boolean {
  const stats = getCourseContentStats(course);
  return !course.thumbnail_image || !course.description?.trim() || stats.activities === 0;
}
