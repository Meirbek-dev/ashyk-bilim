'use server';

import { apiFetch, errorHandling, getResponseMetadata } from '@/lib/api-client';
import type { CustomResponseTyping } from '@/lib/api-client';
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

export interface AssessmentMutationPayload {
  title: string;
  description?: string;
  course_id?: number;
  chapter_id?: number;
  grading_type?: 'NUMERIC' | 'PERCENTAGE';
  due_at?: string | null;
}

function normalizeAssessmentUuid(assessmentUuid: string): string {
  return assessmentUuid.startsWith('assignment_') ? assessmentUuid : `assignment_${assessmentUuid}`;
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
      timeoutMs: 8000,
    });
    if (result.status === 404) return null;
    return await errorHandling(result);
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
      timeoutMs: 8000,
    });
    if (result.status === 404) return null;
    return await errorHandling(result);
  } catch {
    return null;
  }
}

export async function updateAssignmentAssessment(
  assessmentUuid: string,
  body: AssessmentMutationPayload,
): Promise<CustomResponseTyping> {
  const result = await apiFetch(`assessments/${normalizeAssessmentUuid(assessmentUuid)}`, {
    method: 'PATCH',
    baseUrl: getAPIUrl(),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: body.title,
      description: body.description ?? '',
      grading_type: body.grading_type ?? 'PERCENTAGE',
      policy: {
        due_at: body.due_at ?? null,
      },
    }),
  });
  return getResponseMetadata(result);
}
