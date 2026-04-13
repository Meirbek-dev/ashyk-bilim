'use client';

import { getAPIUrl } from '@services/config/config';

const normalizeCourseUuid = (courseUuid: string) =>
  courseUuid.startsWith('course_') ? courseUuid : `course_${courseUuid}`;

export interface CourseListKeyOptions {
  page?: number;
  limit?: number;
  query?: string;
  sortBy?: string;
  preset?: string;
}

interface NormalizedCourseListOptions {
  limit: number;
  page: number;
  preset?: string;
  query?: string;
  sortBy?: string;
}

const buildQueryString = (params: Record<string, string | number | undefined>) => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

const normalizeCourseListOptions = ({ page = 1, limit = 20, query, sortBy, preset }: CourseListKeyOptions = {}) => ({
  limit,
  page,
  ...(preset ? { preset } : {}),
  ...(query ? { query } : {}),
  ...(sortBy ? { sortBy } : {}),
});

export const courseEndpoints = {
  list: ({ page = 1, limit = 20, query, sortBy, preset }: CourseListKeyOptions = {}) =>
    `${getAPIUrl()}courses/page/${page}/limit/${limit}${buildQueryString({ query, sort_by: sortBy, preset })}`,

  editable: ({ page = 1, limit = 20, query, sortBy = 'updated', preset }: CourseListKeyOptions = {}) =>
    `${getAPIUrl()}courses/editable/page/${page}/limit/${limit}${buildQueryString({ query, sort_by: sortBy, preset })}`,

  detail: (courseUuid: string) => `${getAPIUrl()}courses/${normalizeCourseUuid(courseUuid)}`,

  structure: (courseUuid: string, withUnpublishedActivities = false) =>
    `${getAPIUrl()}courses/${normalizeCourseUuid(courseUuid)}/meta?with_unpublished_activities=${withUnpublishedActivities}`,

  rights: (courseUuid: string) => `${getAPIUrl()}courses/${normalizeCourseUuid(courseUuid)}/rights`,

  contributors: (courseUuid: string) => `${getAPIUrl()}courses/${normalizeCourseUuid(courseUuid)}/contributors`,

  chapter: (chapterUuid: string) => `${getAPIUrl()}chapters/${chapterUuid}`,

  activity: (activityUuid: string) => `${getAPIUrl()}activities/${activityUuid}`,
};

export const courseKeys = {
  all: ['courses'] as const,

  list: (options: CourseListKeyOptions = {}) => ['courses', 'list', normalizeCourseListOptions(options)] as const,

  editable: (options: CourseListKeyOptions = {}) =>
    ['courses', 'editable', normalizeCourseListOptions({ ...options, sortBy: options.sortBy ?? 'updated' })] as const,

  detail: (courseUuid: string) => ['courses', 'detail', normalizeCourseUuid(courseUuid)] as const,

  structure: (courseUuid: string, withUnpublishedActivities = false) =>
    ['courses', 'structure', normalizeCourseUuid(courseUuid), withUnpublishedActivities] as const,

  rights: (courseUuid: string) => ['courses', 'rights', normalizeCourseUuid(courseUuid)] as const,

  contributors: (courseUuid: string) => ['courses', 'contributors', normalizeCourseUuid(courseUuid)] as const,

  editorBundle: (courseUuid?: string | null) =>
    courseUuid ? (['courses', 'editor-bundle', normalizeCourseUuid(courseUuid)] as const) : null,

  chapter: (chapterUuid: string) => ['chapters', 'detail', chapterUuid] as const,

  activity: (activityUuid: string) => ['activities', 'detail', activityUuid] as const,
};

export { normalizeCourseUuid };
