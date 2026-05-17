import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import { buildCourseActivityIndex, normalizeActivityUuid } from '@/lib/course-activity-index';

export type StudentActivityStatus =
  | 'course_end'
  | 'unavailable'
  | 'not_started'
  | 'complete'
  | 'submitted'
  | 'needs_revision'
  | 'assessment';

export interface ActivityNavItem {
  id?: number | null;
  uuid: string;
  cleanUuid: string;
  title: string;
  type?: string | null;
  chapterIndex: number;
  activityIndex: number;
  absoluteIndex: number;
  complete: boolean;
  published: boolean;
}

export interface ActivityOutlineChapter {
  id?: number | string | null;
  title: string;
  index: number;
  completeCount: number;
  totalCount: number;
  activities: ActivityNavItem[];
}

export interface StudentActivityViewModel {
  course: {
    uuid: string;
    cleanUuid: string;
    title: string;
    thumbnailImage?: string | null;
  };
  activity: ActivityNavItem | null;
  title: string;
  chapterTitle: string | null;
  status: StudentActivityStatus;
  progress: {
    totalActivities: number;
    completedActivities: number;
    currentComplete: boolean;
    previous: ActivityNavItem | null;
    next: ActivityNavItem | null;
    chapters: ActivityOutlineChapter[];
  };
  permissions: {
    isAuthenticated: boolean;
    canView: boolean;
    canContribute: boolean;
  };
  state: {
    isCourseEnd: boolean;
    isAssessmentHandoff: boolean;
    assessmentUrl: string | null;
  };
}

export function buildStudentActivityViewModel(options: {
  activity: Activity | null;
  activityId: string;
  assessmentUuid?: string | null;
  canContribute: boolean;
  course: CourseStructure;
  isAuthenticated: boolean;
  trailData?: any;
}): StudentActivityViewModel {
  const { activity, activityId, assessmentUuid, canContribute, course, isAuthenticated, trailData } = options;
  const cleanCourseUuid = normalizeCourseUuid(course.course_uuid);
  const cleanCurrentActivityId = normalizeActivityUuid(activityId);
  const activityIndex = buildCourseActivityIndex<Activity>(course.chapters);
  const completedActivityIds = getCompletedActivityIds(course.course_uuid, trailData);

  const chapters = (course.chapters ?? []).map((chapter: any, chapterIndex: number): ActivityOutlineChapter => {
    const activities = activityIndex.allActivities
      .filter((candidate) => candidate.chapterIndex === chapterIndex)
      .map((candidate) => toNavItem(candidate, activityIndex.allActivities.indexOf(candidate), completedActivityIds));
    return {
      id: chapter.id ?? chapter.chapter_uuid ?? chapterIndex,
      title: chapter.name ?? `Chapter ${chapterIndex + 1}`,
      index: chapterIndex,
      completeCount: activities.filter((candidate) => candidate.complete).length,
      totalCount: activities.length,
      activities,
    };
  });

  const currentIndex = activityIndex.indexByCleanUuid.get(cleanCurrentActivityId) ?? -1;
  const currentIndexed = currentIndex >= 0 ? activityIndex.allActivities[currentIndex] : null;
  const current = currentIndexed ? toNavItem(currentIndexed, currentIndex, completedActivityIds) : null;
  const currentComplete = current?.complete ?? false;
  const canView = activityId === 'end' || !activity || activity.published === true || canContribute;
  const isAssessmentHandoff = Boolean(
    activity &&
      assessmentUuid &&
      (activity.activity_type === 'TYPE_EXAM' ||
        activity.activity_type === 'TYPE_CODE_CHALLENGE' ||
        activity.activity_type === 'TYPE_CUSTOM'),
  );

  return {
    course: {
      uuid: course.course_uuid,
      cleanUuid: cleanCourseUuid,
      title: course.name ?? '',
      thumbnailImage: course.thumbnail_image,
    },
    activity: current,
    title: activityId === 'end' ? course.name ?? '' : activity?.name ?? current?.title ?? '',
    chapterTitle: currentIndexed?.chapterName ?? null,
    status: getStatus({ activity, canView, currentComplete, isAssessmentHandoff, isCourseEnd: activityId === 'end' }),
    progress: {
      totalActivities: activityIndex.allActivities.length,
      completedActivities: activityIndex.allActivities.filter((candidate) =>
        completedActivityIds.has(Number(candidate.id)),
      ).length,
      currentComplete,
      previous: currentIndex > 0 ? toNavItem(activityIndex.allActivities[currentIndex - 1], currentIndex - 1, completedActivityIds) : null,
      next:
        currentIndex >= 0 && currentIndex < activityIndex.allActivities.length - 1
          ? toNavItem(activityIndex.allActivities[currentIndex + 1], currentIndex + 1, completedActivityIds)
          : null,
      chapters,
    },
    permissions: {
      isAuthenticated,
      canView,
      canContribute,
    },
    state: {
      isCourseEnd: activityId === 'end',
      isAssessmentHandoff,
      assessmentUrl: assessmentUuid ? `/assessments/${assessmentUuid.replace(/^assessment_/, '')}` : null,
    },
  };
}

export function normalizeCourseUuid(courseUuid?: string | null): string {
  return courseUuid?.replace(/^course_/, '') ?? '';
}

function toNavItem(activity: any, absoluteIndex: number, completedActivityIds: Set<number>): ActivityNavItem {
  return {
    id: activity.id,
    uuid: activity.activity_uuid ?? '',
    cleanUuid: activity.cleanUuid ?? normalizeActivityUuid(activity.activity_uuid),
    title: activity.name ?? '',
    type: activity.activity_type,
    chapterIndex: activity.chapterIndex,
    activityIndex: activity.activityIndex,
    absoluteIndex,
    complete: typeof activity.id === 'number' ? completedActivityIds.has(activity.id) : false,
    published: activity.published === true,
  };
}

function getCompletedActivityIds(courseUuid: string | undefined, trailData: any): Set<number> {
  const cleanCourseUuid = normalizeCourseUuid(courseUuid);
  const run = trailData?.runs?.find((candidateRun: any) => {
    const runCourseUuid = candidateRun.course?.course_uuid ?? candidateRun.course_uuid;
    return normalizeCourseUuid(runCourseUuid) === cleanCourseUuid;
  });
  return new Set(
    (run?.steps ?? [])
      .filter((step: any) => step.complete === true && typeof step.activity_id === 'number')
      .map((step: any) => Number(step.activity_id)),
  );
}

function getStatus(options: {
  activity: Activity | null;
  canView: boolean;
  currentComplete: boolean;
  isAssessmentHandoff: boolean;
  isCourseEnd: boolean;
}): StudentActivityStatus {
  if (options.isCourseEnd) return 'course_end';
  if (!options.activity || !options.canView) return 'unavailable';
  if (options.isAssessmentHandoff) return 'assessment';
  if (options.currentComplete) return 'complete';
  return 'not_started';
}
