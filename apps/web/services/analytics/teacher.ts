import type { AnalyticsQuery, AssessmentType } from '@/types/analytics';
import type { components } from '@/lib/api/generated';
import { apiFetch } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';

type TeacherOverviewResponse = components['schemas']['TeacherOverviewResponse'];
type TeacherCourseListResponse = components['schemas']['TeacherCourseListResponse'];
type TeacherCourseDetailResponse = components['schemas']['TeacherCourseDetailResponse'];
type TeacherAssessmentListResponse = components['schemas']['TeacherAssessmentListResponse'];
type TeacherAssessmentDetailResponse = components['schemas']['TeacherAssessmentDetailResponse'];
type AtRiskLearnersResponse = components['schemas']['AtRiskLearnersResponse'];

const buildQueryString = (query: AnalyticsQuery = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

const getFirstQueryValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

async function analyticsRequest<T>(path: string, query?: AnalyticsQuery): Promise<T> {
  const response = await apiFetch(`analytics/${path}${buildQueryString(query)}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.detail?.message || payload?.detail || `Analytics request failed (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

export function normalizeAnalyticsQuery(searchParams: Record<string, string | string[] | undefined>): AnalyticsQuery {
  const teacherUserId = getFirstQueryValue(searchParams.teacher_user_id);
  const page = getFirstQueryValue(searchParams.page);
  const pageSize = getFirstQueryValue(searchParams.page_size);
  return {
    window: (getFirstQueryValue(searchParams.window) as AnalyticsQuery['window']) || '28d',
    compare: (getFirstQueryValue(searchParams.compare) as AnalyticsQuery['compare']) || 'previous_period',
    bucket: (getFirstQueryValue(searchParams.bucket) as AnalyticsQuery['bucket']) || 'day',
    course_ids: getFirstQueryValue(searchParams.course_ids),
    cohort_ids: getFirstQueryValue(searchParams.cohort_ids),
    teacher_user_id: teacherUserId ? Number(teacherUserId) : undefined,
    timezone: getFirstQueryValue(searchParams.timezone) || 'UTC',
    page: page ? Number(page) : 1,
    page_size: pageSize ? Number(pageSize) : 25,
    sort_by: getFirstQueryValue(searchParams.sort_by),
    sort_order: (getFirstQueryValue(searchParams.sort_order) as AnalyticsQuery['sort_order']) || 'desc',
    bucket_start: getFirstQueryValue(searchParams.bucket_start),
  };
}

export function getTeacherOverview(query?: AnalyticsQuery) {
  return analyticsRequest<TeacherOverviewResponse>('teacher/overview', query);
}

export function getTeacherCourseList(query?: AnalyticsQuery) {
  return analyticsRequest<TeacherCourseListResponse>('teacher/courses', query);
}

export function getTeacherCourseDetailByUuid(courseUuid: string, query?: AnalyticsQuery) {
  return analyticsRequest<TeacherCourseDetailResponse>(`teacher/courses/by-uuid/${courseUuid}`, query);
}

export function getTeacherCourseDetail(courseId: number, query?: AnalyticsQuery) {
  return analyticsRequest<TeacherCourseDetailResponse>(`teacher/courses/${courseId}`, query);
}

export function getTeacherAssessmentList(query?: AnalyticsQuery) {
  return analyticsRequest<TeacherAssessmentListResponse>('teacher/assessments', query);
}

export interface GetTeacherAssessmentDetailParams {
  assessmentType: AssessmentType;
  assessmentId: number;
  query?: AnalyticsQuery;
}

export function getTeacherAssessmentDetail({ assessmentType, assessmentId, query }: GetTeacherAssessmentDetailParams) {
  return analyticsRequest<TeacherAssessmentDetailResponse>(
    `teacher/assessments/${assessmentType}/${assessmentId}`,
    query,
  );
}

export function getAtRiskLearners(query?: AnalyticsQuery) {
  return analyticsRequest<AtRiskLearnersResponse>('teacher/learners/at-risk', query);
}

export function getAnalyticsExportUrl(
  exportName: 'at-risk' | 'grading-backlog' | 'course-progress' | 'assessment-outcomes',
  query?: AnalyticsQuery,
) {
  return `${getAPIUrl()}analytics/teacher/exports/${exportName}.csv${buildQueryString(query)}`;
}

export async function downloadAnalyticsExport(exportUrl: string): Promise<{ blob: Blob; filename: string }> {
  const response = await apiFetch(exportUrl);

  if (!response.ok) {
    throw new Error(`Analytics export failed (${response.status})`);
  }

  const pathWithoutQuery = exportUrl.split('?').shift() ?? exportUrl;

  return {
    blob: await response.blob(),
    filename: pathWithoutQuery.split('/').pop() ?? 'export.csv',
  };
}
