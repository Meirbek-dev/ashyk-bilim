import type { AnalyticsQuery, AssessmentType } from '@/types/analytics';
import type { components } from '@/lib/api/generated';
import { apiFetch } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';

type TeacherOverviewResponse = components['schemas']['TeacherOverviewResponse'];
type AdminAnalyticsResponse = components['schemas']['AdminAnalyticsResponse'];
type TeacherCourseListResponse = components['schemas']['TeacherCourseListResponse'];
type TeacherCourseDetailResponse = components['schemas']['TeacherCourseDetailResponse'];
type TeacherAssessmentListResponse = components['schemas']['TeacherAssessmentListResponse'];
type TeacherAssessmentDetailResponse = components['schemas']['TeacherAssessmentDetailResponse'];
type AtRiskLearnersResponse = components['schemas']['AtRiskLearnersResponse'];
type DrillThroughResponse = components['schemas']['DrillThroughResponse'];
type SavedAnalyticsViewCreate = components['schemas']['SavedAnalyticsViewCreate'];
type SavedAnalyticsViewListResponse = components['schemas']['SavedAnalyticsViewListResponse'];
type SavedAnalyticsViewRow = components['schemas']['SavedAnalyticsViewRow'];

export interface TeacherInterventionCreate {
  user_id: number;
  course_id: number;
  intervention_type:
    | 'message_sent'
    | 'submission_graded'
    | 'extension_granted'
    | 'meeting_scheduled'
    | 'learner_recovered';
  status?: 'planned' | 'completed' | 'resolved';
  outcome?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
}

export interface TeacherInterventionRow {
  id: number;
  teacher_user_id: number;
  user_id: number;
  course_id: number;
  intervention_type: TeacherInterventionCreate['intervention_type'];
  status: 'planned' | 'completed' | 'resolved';
  outcome: string | null;
  notes: string | null;
  risk_score_before: number | null;
  risk_score_after: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

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

const getPositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getOptionalInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

async function analyticsRequest<T>(path: string, query?: AnalyticsQuery, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`analytics/${path}${buildQueryString(query)}`, init);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.detail?.message || payload?.detail || `Analytics request failed (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
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
    teacher_user_id: getOptionalInteger(teacherUserId),
    timezone: getFirstQueryValue(searchParams.timezone) || 'UTC',
    page: getPositiveInteger(page, 1),
    page_size: getPositiveInteger(pageSize, 25),
    sort_by: getFirstQueryValue(searchParams.sort_by),
    sort_order: (getFirstQueryValue(searchParams.sort_order) as AnalyticsQuery['sort_order']) || 'desc',
    bucket_start: getFirstQueryValue(searchParams.bucket_start),
  };
}

export function getTeacherOverview(query?: AnalyticsQuery) {
  return analyticsRequest<TeacherOverviewResponse>('teacher/overview', query);
}

export function getAdminAnalyticsOverview(query?: AnalyticsQuery) {
  return analyticsRequest<AdminAnalyticsResponse>('admin/overview', query);
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

export function createTeacherIntervention(payload: TeacherInterventionCreate, query?: AnalyticsQuery) {
  return analyticsRequest<TeacherInterventionRow>(`teacher/interventions`, query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getSavedAnalyticsViews(query?: AnalyticsQuery) {
  return analyticsRequest<SavedAnalyticsViewListResponse>('teacher/saved-views', query);
}

export function saveAnalyticsView(payload: SavedAnalyticsViewCreate, query?: AnalyticsQuery) {
  return analyticsRequest<SavedAnalyticsViewRow>('teacher/saved-views', query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteAnalyticsView(viewId: number, query?: AnalyticsQuery) {
  return analyticsRequest<void>(`teacher/saved-views/${viewId}`, query, {
    method: 'DELETE',
  });
}

export function getTeacherDrillThrough(
  metric: DrillThroughResponse['metric'],
  query?: AnalyticsQuery & {
    course_id?: number;
    assessment_type?: AssessmentType;
    assessment_id?: number;
  },
) {
  return analyticsRequest<DrillThroughResponse>(`teacher/drill-through/${metric}`, query);
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
