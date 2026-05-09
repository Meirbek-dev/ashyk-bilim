'use server';

import type {
  AssessmentType,
  BatchGradeItem,
  BatchGradeResponse,
  BulkAction,
  BulkPublishGradesResponse,
  InlineItemFeedback,
  InlineItemFeedbackInput,
  Submission,
  SubmissionsPage,
  SubmissionStats,
  TeacherGradeInput,
} from '@/types/grading';
import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { revalidateTag } from 'next/cache';
import { StaleGradeError } from './errors';

// ── Student endpoints ─────────────────────────────────────────────────────────

export async function startSubmission(activityId: number, assessmentType: AssessmentType): Promise<Submission> {
  const res = await apiFetch(`grading/start/v2/${activityId}?assessment_type=${assessmentType}`, { method: 'POST' });
  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to start submission');
  return meta.data as Submission;
}

export async function submitAssessment(
  activityId: number,
  assessmentType: AssessmentType,
  answersPayload: Record<string, unknown>,
  violationCount = 0,
): Promise<Submission> {
  const res = await apiFetch(
    `grading/submit/${activityId}?assessment_type=${assessmentType}&violation_count=${violationCount}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answersPayload),
    },
  );
  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to submit assessment');

  revalidateTag('submissions', 'max');
  return meta.data as Submission;
}

export async function getMySubmissions(activityId: number): Promise<Submission[]> {
  const res = await apiFetch(`grading/submissions/me?activity_id=${activityId}`, {
    next: { tags: ['submissions'] },
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) return [];
  return meta.data as Submission[];
}

export async function getMySubmissionResult(submissionUuid: string): Promise<Submission | null> {
  const res = await apiFetch(`grading/submissions/me/${submissionUuid}`, {
    next: { tags: ['submissions'] },
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) return null;
  return meta.data as Submission;
}

// ── Teacher endpoints ─────────────────────────────────────────────────────────

export async function getSubmissionsForActivity(
  activityId: number,
  options: {
    status?: string;
    search?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<SubmissionsPage> {
  const params = new URLSearchParams({ activity_id: String(activityId) });
  if (options.status) params.set('status', options.status);
  if (options.search) params.set('search', options.search);
  if (options.sortBy) params.set('sort_by', options.sortBy);
  if (options.sortDir) params.set('sort_dir', options.sortDir);
  if (options.page) params.set('page', String(options.page));
  if (options.pageSize) params.set('page_size', String(options.pageSize));

  const res = await apiFetch(`grading/submissions?${params}`, {
    next: { tags: ['submissions'] },
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) return { items: [], total: 0, page: 1, page_size: 25, pages: 1 };
  return meta.data as SubmissionsPage;
}

export async function getSubmissionStats(activityId: number): Promise<SubmissionStats | null> {
  const res = await apiFetch(`grading/submissions/stats?activity_id=${activityId}`, {
    next: { tags: ['submissions'] },
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) return null;
  return meta.data as SubmissionStats;
}

export async function getSubmission(submissionUuid: string): Promise<Submission | null> {
  const res = await apiFetch(`grading/submissions/${submissionUuid}`, {
    next: { tags: ['submissions'] },
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) return null;
  return meta.data as Submission;
}

export async function getAssessmentSubmission(
  assessmentUuid: string,
  submissionUuid: string,
): Promise<Submission | null> {
  const res = await apiFetch(`assessments/${assessmentUuid}/submissions/${submissionUuid}`, {
    next: { tags: ['submissions'] },
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) return null;
  return meta.data as Submission;
}

export async function saveGrade(
  submissionUuid: string,
  gradeInput: TeacherGradeInput,
  /** Optimistic-concurrency version from the last-fetched submission. */
  version?: number,
  assessmentUuid?: string,
): Promise<Submission> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (version !== undefined) {
    headers['If-Match'] = String(version);
  }
  const endpoint = assessmentUuid
    ? `assessments/${assessmentUuid}/submissions/${submissionUuid}`
    : `grading/submissions/${submissionUuid}`;
  const res = await apiFetch(endpoint, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(gradeInput),
  });

  if (res.status === 412) {
    // Server has a newer version — retrieve it and throw a typed error so the
    // UI can show a merge banner instead of a generic toast.
    const latest = assessmentUuid
      ? await getAssessmentSubmission(assessmentUuid, submissionUuid)
      : await getSubmission(submissionUuid);
    throw new StaleGradeError(latest ?? ({ submission_uuid: submissionUuid } as Submission));
  }

  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to save grade');

  revalidateTag('submissions', 'max');
  return meta.data as Submission;
}

export async function batchGradeSubmissions(grades: BatchGradeItem[]): Promise<BatchGradeResponse> {
  const res = await apiFetch('grading/submissions/batch', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grades }),
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to submit batch grades');

  revalidateTag('submissions', 'max');
  return meta.data as BatchGradeResponse;
}

export async function extendDeadline(
  activityId: number,
  input: { user_uuids: string[]; new_due_at: string; reason?: string },
): Promise<BulkAction> {
  const res = await apiFetch(`grading/activities/${activityId}/extend-deadline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to extend deadline');

  revalidateTag('submissions', 'max');
  return meta.data as BulkAction;
}

export async function publishActivityGrades(activityId: number): Promise<BulkPublishGradesResponse> {
  const res = await apiFetch(`grading/activities/${activityId}/publish-grades`, { method: 'POST' });
  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to publish grades');

  revalidateTag('submissions', 'max');
  return meta.data as BulkPublishGradesResponse;
}

export async function publishAssessmentGrades(assessmentUuid: string): Promise<BulkPublishGradesResponse> {
  const res = await apiFetch(`assessments/${assessmentUuid}/publish-grades`, { method: 'POST' });
  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to publish grades');

  revalidateTag('submissions', 'max');
  return meta.data as BulkPublishGradesResponse;
}

export async function getInlineFeedback(submissionUuid: string): Promise<InlineItemFeedback[]> {
  const res = await apiFetch(`grading/submissions/${submissionUuid}/feedback`, {
    next: { tags: ['submissions'] },
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) return [];
  return meta.data as InlineItemFeedback[];
}

export async function createInlineFeedback(
  submissionUuid: string,
  feedback: InlineItemFeedbackInput,
): Promise<InlineItemFeedback> {
  const res = await apiFetch(`grading/submissions/${submissionUuid}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback),
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to create feedback');
  revalidateTag('submissions', 'max');
  return meta.data as InlineItemFeedback;
}

export async function updateInlineFeedback(
  feedbackId: number,
  feedback: Partial<InlineItemFeedbackInput>,
): Promise<InlineItemFeedback> {
  const res = await apiFetch(`grading/feedback/${feedbackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback),
  });
  const meta = await getResponseMetadata(res);
  if (!meta.success) throw new Error(meta.data?.detail ?? 'Failed to update feedback');
  revalidateTag('submissions', 'max');
  return meta.data as InlineItemFeedback;
}

export async function deleteInlineFeedback(feedbackId: number): Promise<void> {
  const res = await apiFetch(`grading/feedback/${feedbackId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete feedback');
  revalidateTag('submissions', 'max');
}

export async function exportGradesCSV(activityId: number): Promise<string> {
  const res = await apiFetch(`grading/submissions/export?activity_id=${activityId}`);
  if (!res.ok) return '';
  return res.text();
}
