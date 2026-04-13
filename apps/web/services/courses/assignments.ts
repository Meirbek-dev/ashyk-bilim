'use server';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';

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

export async function getAssignmentTaskSubmissionsMe(assignmentTaskUUID: string, assignmentUUID: string) {
  const result = await apiFetch(`assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/submissions/me`);
  return await getResponseMetadata(result);
}

export interface GetAssignmentTaskSubmissionsUserParams {
  assignmentTaskUUID: string;
  user_id: number;
  assignmentUUID: string;
}

export async function getAssignmentTaskSubmissionsUser({
  assignmentTaskUUID,
  user_id,
  assignmentUUID,
}: GetAssignmentTaskSubmissionsUserParams) {
  const result = await apiFetch(
    `assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/submissions/user/${user_id}`,
  );
  return await getResponseMetadata(result);
}

export interface HandleAssignmentTaskSubmissionParams {
  body: any;
  assignmentTaskUUID: string;
  assignmentUUID: string;
}

export async function handleAssignmentTaskSubmission({
  body,
  assignmentTaskUUID,
  assignmentUUID,
}: HandleAssignmentTaskSubmissionParams) {
  const result = await apiFetch(`assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/submissions`, {
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
