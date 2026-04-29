'use server';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';
import type {
  AssignmentDraftPatch,
  AssignmentDraftRead,
  AssignmentRead,
  AssignmentTaskAnswer,
} from '@/features/assignments/domain';

export type AssignmentType = 'QUIZ' | 'FILE_SUBMISSION' | 'FORM' | 'OTHER';

export interface AssignmentMutationPayload {
  title?: string;
  description?: string;
  due_at?: string | null;
  grading_type?: string;
}

export interface AssignmentTaskMutationPayload {
  title?: string;
  description?: string;
  hint?: string | null;
  reference_file?: string | null;
  assignment_type?: AssignmentType;
  contents?: Record<string, unknown>;
  max_grade_value?: number;
}

function normalizeAssignmentUuid(assignmentUUID: string) {
  return assignmentUUID.startsWith('assignment_') ? assignmentUUID : `assignment_${assignmentUUID}`;
}

export async function updateAssignment(body: AssignmentMutationPayload, assignmentUUID: string) {
  const result = await apiFetch(`assignments/${assignmentUUID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function publishAssignment(assignmentUUID: string, scheduledAt?: string | null) {
  const result = await apiFetch(`assignments/${normalizeAssignmentUuid(assignmentUUID)}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduled_at: scheduledAt ?? null }),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata as typeof metadata & { data: AssignmentRead };
}

export async function archiveAssignment(assignmentUUID: string) {
  const result = await apiFetch(`assignments/${normalizeAssignmentUuid(assignmentUUID)}/archive`, { method: 'POST' });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata as typeof metadata & { data: AssignmentRead };
}

export async function cancelAssignmentSchedule(assignmentUUID: string) {
  const result = await apiFetch(`assignments/${normalizeAssignmentUuid(assignmentUUID)}/cancel-schedule`, {
    method: 'POST',
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata as typeof metadata & { data: AssignmentRead };
}

export async function getAssignmentFromActivityUUID(activityUUID: string) {
  const result = await apiFetch(`assignments/activity/${activityUUID}`);
  return await getResponseMetadata(result);
}

export async function deleteAssignment(assignmentUUID: string) {
  const result = await apiFetch(`assignments/${assignmentUUID}`, { method: 'DELETE' });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function deleteAssignmentUsingActivityUUID(activityUUID: string) {
  const result = await apiFetch(`assignments/activity/${activityUUID}`, { method: 'DELETE' });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function getAssignmentDraftSubmission(assignmentUUID: string) {
  const result = await apiFetch(`assignments/${normalizeAssignmentUuid(assignmentUUID)}/submissions/me/draft`);
  return await getResponseMetadata(result);
}

export async function saveAssignmentDraftSubmission(assignmentUUID: string, body: AssignmentDraftPatch) {
  const result = await apiFetch(`assignments/${normalizeAssignmentUuid(assignmentUUID)}/submissions/me/draft`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag('submissions', 'max');
  }

  return metadata;
}

export async function submitAssignmentDraftSubmission(assignmentUUID: string, body?: AssignmentDraftPatch) {
  const result = await apiFetch(`assignments/${normalizeAssignmentUuid(assignmentUUID)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? { tasks: [] }),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag('submissions', 'max');
  }

  return metadata;
}

// tasks

export async function createAssignmentTask(body: AssignmentTaskMutationPayload, assignmentUUID: string) {
  const result = await apiFetch(`assignments/${assignmentUUID}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function getAssignmentTask(assignmentUUID: string, assignmentTaskUUID: string) {
  const result = await apiFetch(`assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}`);
  return await getResponseMetadata(result);
}

export interface UpdateAssignmentTaskParams {
  body: AssignmentTaskMutationPayload;
  assignmentTaskUUID: string;
  assignmentUUID: string;
}

export async function updateAssignmentTask({ body, assignmentTaskUUID, assignmentUUID }: UpdateAssignmentTaskParams) {
  const result = await apiFetch(`assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function deleteAssignmentTask(assignmentTaskUUID: string, assignmentUUID: string) {
  const result = await apiFetch(`assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}`, { method: 'DELETE' });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export interface UpdateReferenceFileParams {
  file: Blob | File;
  assignmentTaskUUID: string;
  assignmentUUID: string;
}

export async function updateReferenceFile({ file, assignmentTaskUUID, assignmentUUID }: UpdateReferenceFileParams) {
  const formData = new FormData();
  if (file) {
    formData.append('reference_file', file);
  }
  const result = await apiFetch(`assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/ref_file`, {
    method: 'POST',
    body: formData,
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export interface UpdateSubFileParams {
  file: Blob | File;
  assignmentTaskUUID: string;
  assignmentUUID: string;
}

export async function updateSubFile({ file, assignmentTaskUUID, assignmentUUID }: UpdateSubFileParams) {
  const formData = new FormData();
  if (file) {
    formData.append('sub_file', file);
  }
  const result = await apiFetch(`assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/sub_file`, {
    method: 'POST',
    body: formData,
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function getAssignmentsFromACourse(courseUUID: string) {
  const result = await apiFetch(`assignments/course/${courseUUID}`);
  return await getResponseMetadata(result);
}

export async function getAssignmentsFromCourses(courseUUIDs: string[]) {
  const params = new URLSearchParams();
  for (const uuid of courseUUIDs) params.append('course_uuids', uuid);
  const result = await apiFetch(`assignments/courses?${params.toString()}`);
  return await getResponseMetadata(result);
}

/** Body shape for POST /assignments/with-activity (creation only). */
export interface AssignmentCreatePayload {
  title: string;
  description?: string;
  due_at?: string | null;
  grading_type: string;
  course_id?: number;
  chapter_id?: number;
  published?: boolean;
}

export interface CreateAssignmentWithActivityParams {
  body: AssignmentCreatePayload;
  chapterId: number;
  activityName: string;
}

export async function createAssignmentWithActivity({
  body,
  chapterId,
  activityName,
}: CreateAssignmentWithActivityParams) {
  const result = await apiFetch(
    `assignments/with-activity?chapter_id=${chapterId}&activity_name=${encodeURIComponent(activityName)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}
