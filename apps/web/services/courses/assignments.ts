'use server';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';
import type { AssignmentRead } from '@/features/assessments/registry/assignment/models';

interface AssignmentTaskPatchAnswer {
  task_uuid: string;
  content_type: 'file' | 'text' | 'form' | 'quiz' | 'other';
  file_key?: string | null;
  uploads?: { upload_uuid: string; filename?: string }[];
  text_content?: string | null;
  form_data?: { answers?: Record<string, string> } | null;
  quiz_answers?: { answers?: Record<string, string[]> } | null;
  answer_metadata?: Record<string, unknown>;
}

export interface AssignmentDraftPatch {
  tasks: AssignmentTaskPatchAnswer[];
}

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

function lifecycleToPublished(lifecycle?: string | null) {
  return lifecycle === 'PUBLISHED';
}

function assessmentToAssignmentRead(data: any): AssignmentRead {
  return {
    assignment_uuid: data.assessment_uuid,
    title: data.title,
    description: data.description ?? '',
    due_at: data.assessment_policy?.due_at ?? null,
    published: lifecycleToPublished(data.lifecycle),
    status: data.lifecycle,
    scheduled_publish_at: data.scheduled_at ?? null,
    published_at: data.published_at ?? null,
    archived_at: data.archived_at ?? null,
    weight: data.weight ?? 1,
    grading_type: data.grading_type ?? 'PERCENTAGE',
    course_uuid: data.course_uuid ?? null,
    activity_uuid: data.activity_uuid ?? null,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  } as AssignmentRead;
}

function assignmentPatchToAssessmentPatch(body: AssignmentDraftPatch) {
  return {
    answers: body.tasks.map((task) => {
      if (task.content_type === 'file') {
        return {
          item_uuid: task.task_uuid,
          answer: {
            kind: 'ASSIGNMENT_FILE',
            content_type: 'file',
            uploads: task.file_key ? [{ upload_uuid: task.file_key }] : [],
            file_key: task.file_key ?? null,
            answer_metadata: task.answer_metadata ?? {},
          },
        };
      }

      if (task.content_type === 'quiz') {
        return {
          item_uuid: task.task_uuid,
          answer: {
            kind: 'ASSIGNMENT_QUIZ',
            content_type: 'quiz',
            quiz_answers: task.quiz_answers ?? null,
            answer_metadata: task.answer_metadata ?? {},
          },
        };
      }

      if (task.content_type === 'form') {
        return {
          item_uuid: task.task_uuid,
          answer: {
            kind: 'ASSIGNMENT_FORM',
            content_type: 'form',
            form_data: task.form_data ?? null,
            answer_metadata: task.answer_metadata ?? {},
          },
        };
      }

      return {
        item_uuid: task.task_uuid,
        answer: {
          kind: 'ASSIGNMENT_OTHER',
          content_type: task.content_type === 'other' ? 'other' : 'text',
          text_content: task.text_content ?? null,
          answer_metadata: task.answer_metadata ?? {},
        },
      };
    }),
  };
}

export async function updateAssignment(body: AssignmentMutationPayload, assignmentUUID: string) {
  const payload: Record<string, unknown> = {};
  if (body.title !== undefined) payload.title = body.title;
  if (body.description !== undefined) payload.description = body.description;
  if (body.grading_type !== undefined) payload.grading_type = body.grading_type;
  if (body.due_at !== undefined) payload.policy = { due_at: body.due_at };

  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function publishAssignment(assignmentUUID: string, scheduledAt?: string | null) {
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/lifecycle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: scheduledAt ? 'SCHEDULED' : 'PUBLISHED', scheduled_at: scheduledAt ?? null }),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }
  return metadata.success && metadata.data
    ? { ...metadata, data: assessmentToAssignmentRead(metadata.data) }
    : (metadata as typeof metadata & { data: AssignmentRead });
}

export async function archiveAssignment(assignmentUUID: string) {
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/lifecycle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'ARCHIVED' }),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }
  return metadata.success && metadata.data
    ? { ...metadata, data: assessmentToAssignmentRead(metadata.data) }
    : (metadata as typeof metadata & { data: AssignmentRead });
}

export async function cancelAssignmentSchedule(assignmentUUID: string) {
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/lifecycle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'DRAFT' }),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }
  return metadata.success && metadata.data
    ? { ...metadata, data: assessmentToAssignmentRead(metadata.data) }
    : (metadata as typeof metadata & { data: AssignmentRead });
}

export async function getAssignmentFromActivityUUID(activityUUID: string) {
  const result = await apiFetch(`assessments/activity/${activityUUID}`);
  const metadata = await getResponseMetadata(result);

  if (!metadata.success || !metadata.data) {
    return metadata;
  }

  return {
    ...metadata,
    data: assessmentToAssignmentRead(metadata.data),
  };
}

export async function getAssignmentDraftSubmission(assignmentUUID: string) {
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/draft`);
  const metadata = await getResponseMetadata(result);
  if (!metadata.success || !metadata.data) return metadata;
  return {
    ...metadata,
    data: {
      ...metadata.data,
      assignment_uuid: metadata.data.assessment_uuid,
    },
  };
}

export async function saveAssignmentDraftSubmission(assignmentUUID: string, body: AssignmentDraftPatch) {
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/draft`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(assignmentPatchToAssessmentPatch(body)),
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
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(assignmentPatchToAssessmentPatch(body ?? { tasks: [] })),
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
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/assignment/tasks`, {
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
  const result = await apiFetch(
    `assessments/${normalizeAssignmentUuid(assignmentUUID)}/assignment/tasks/${assignmentTaskUUID}`,
  );
  return await getResponseMetadata(result);
}

export interface UpdateAssignmentTaskParams {
  body: AssignmentTaskMutationPayload;
  assignmentTaskUUID: string;
  assignmentUUID: string;
}

export async function updateAssignmentTask({ body, assignmentTaskUUID, assignmentUUID }: UpdateAssignmentTaskParams) {
  const result = await apiFetch(
    `assessments/${normalizeAssignmentUuid(assignmentUUID)}/assignment/tasks/${assignmentTaskUUID}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function deleteAssignmentTask(assignmentTaskUUID: string, assignmentUUID: string) {
  const result = await apiFetch(
    `assessments/${normalizeAssignmentUuid(assignmentUUID)}/assignment/tasks/${assignmentTaskUUID}`,
    {
      method: 'DELETE',
    },
  );
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
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
  chapterId: _chapterId,
  activityName: _activityName,
}: CreateAssignmentWithActivityParams) {
  const result = await apiFetch('assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'ASSIGNMENT',
      title: body.title,
      description: body.description ?? '',
      course_id: body.course_id,
      chapter_id: body.chapter_id,
      grading_type: body.grading_type,
      policy: {
        due_at: body.due_at ?? null,
      },
    }),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}
