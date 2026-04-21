'use server';

import type {
  AssessmentType,
  BatchGradeItem,
  BatchGradeResponse,
  Submission,
  SubmissionsPage,
  SubmissionStats,
  TeacherGradeInput,
} from '@/types/grading';
import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { revalidateTag } from 'next/cache';

// ── Student endpoints ─────────────────────────────────────────────────────────

export async function startSubmission(activityId: number, assessmentType: AssessmentType): Promise<Submission> {
  const res = await apiFetch(`grading/start/${activityId}?assessment_type=${assessmentType}`, { method: 'POST' });
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

export async function saveGrade(submissionUuid: string, gradeInput: TeacherGradeInput): Promise<Submission> {
  const res = await apiFetch(`grading/submissions/${submissionUuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gradeInput),
  });
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

export async function exportGradesCSV(activityId: number): Promise<string> {
  const res = await apiFetch(`grading/submissions/export?activity_id=${activityId}`);
  if (!res.ok) return '';
  return res.text();
}
