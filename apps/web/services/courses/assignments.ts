'use server';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';
import type { Submission } from '@/types/grading';

export interface AssignmentTaskAnswer {
  task_uuid: string;
  content_type: 'file' | 'text' | 'form' | 'quiz' | 'other';
  file_key?: string | null;
  text_content?: string | null;
  form_data?: Record<string, unknown> | null;
  quiz_answers?: Record<string, unknown> | null;
  answer_metadata?: Record<string, unknown>;
}

export interface AssignmentDraftPatch {
  tasks: AssignmentTaskAnswer[];
}

export interface AssignmentDraftRead {
  assignment_uuid: string;
  submission: Submission | null;
}

function normalizeAssignmentUuid(assignmentUUID: string) {
  return assignmentUUID.startsWith('assignment_') ? assignmentUUID : `assignment_${assignmentUUID}`;
}

export async function createAssignment(body: any) {
  const result = await apiFetch('assignments/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function updateAssignment(body: any, assignmentUUID: string) {
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

export async function createAssignmentTask(body: any, assignmentUUID: string) {
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

export async function getAssignmentTask(assignmentTaskUUID: string) {
  const result = await apiFetch(`assignments/task/${assignmentTaskUUID}`);
  return await getResponseMetadata(result);
}

export interface UpdateAssignmentTaskParams {
  body: any;
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
  file: any;
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
  file: any;
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
  const result = await apiFetch('assignments/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_uuids: courseUUIDs }),
  });
  return await getResponseMetadata(result);
}

export interface CreateAssignmentWithActivityParams {
  body: any;
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
