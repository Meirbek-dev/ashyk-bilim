'use server';

import { apiFetch, errorHandling } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';

export interface AssessmentSummary {
  id: number;
  assessment_uuid: string;
  activity_id: number;
  activity_uuid: string;
  course_id: number | null;
  course_uuid: string | null;
  chapter_id: number;
  kind: 'ASSIGNMENT' | 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ';
  title: string;
  description: string;
  lifecycle: string;
  scheduled_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
}

/**
 * Server-side: fetch an assessment by its UUID.
 * Returns null on 404 rather than throwing.
 */
export async function getAssessmentByUuid(assessmentUuid: string): Promise<AssessmentSummary | null> {
  try {
    const result = await apiFetch(`assessments/${assessmentUuid}`, {
      method: 'GET',
      baseUrl: getAPIUrl(),
      signal: AbortSignal.timeout(8000),
    });
    if (result.status === 404) return null;
    return (await errorHandling(result)) as AssessmentSummary;
  } catch {
    return null;
  }
}

/**
 * Server-side: fetch an assessment by its activity UUID.
 * Returns null on 404 rather than throwing.
 */
export async function getAssessmentByActivityUuid(activityUuid: string): Promise<AssessmentSummary | null> {
  try {
    const result = await apiFetch(`assessments/activity/${activityUuid}`, {
      method: 'GET',
      baseUrl: getAPIUrl(),
      signal: AbortSignal.timeout(8000),
    });
    if (result.status === 404) return null;
    return (await errorHandling(result)) as AssessmentSummary;
  } catch {
    return null;
  }
}
