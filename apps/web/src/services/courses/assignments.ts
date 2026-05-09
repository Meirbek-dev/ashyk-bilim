'use server';

import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { tags } from '@/lib/cacheTags';
import type { AssessmentItem } from '@/features/assessments/domain/items';

export type AssignmentStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export interface AssignmentRead {
  assignment_uuid: string;
  title: string;
  description: string;
  due_at?: string | null;
  status: AssignmentStatus;
  scheduled_publish_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  weight: number;
  grading_type: 'NUMERIC' | 'PERCENTAGE';
  course_uuid?: string | null;
  activity_uuid?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

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
  };
}

function assignmentPatchToAssessmentPatch(body: AssignmentDraftPatch) {
  return {
    answers: body.tasks.map((task) => {
      if (task.content_type === 'file') {
        return {
          item_uuid: task.task_uuid,
          answer: {
            kind: 'FILE_UPLOAD',
            uploads: task.uploads ?? (task.file_key ? [{ upload_uuid: task.file_key }] : []),
          },
        };
      }

      if (task.content_type === 'quiz') {
        const firstAnswer = Object.values(task.quiz_answers?.answers ?? {})[0] ?? [];
        return {
          item_uuid: task.task_uuid,
          answer: {
            kind: 'CHOICE',
            selected: Array.isArray(firstAnswer) ? firstAnswer : [],
          },
        };
      }

      if (task.content_type === 'form') {
        return {
          item_uuid: task.task_uuid,
          answer: {
            kind: 'FORM',
            values: task.form_data?.answers ?? {},
          },
        };
      }

      return {
        item_uuid: task.task_uuid,
        answer: {
          kind: 'OPEN_TEXT',
          text: task.text_content ?? '',
        },
      };
    }),
  };
}

function toAssignmentTask(data: unknown) {
  return data as AssessmentItem;
}

function normalizeTaskType(type?: AssignmentType | null) {
  switch (type) {
    case 'FILE_SUBMISSION':
    case 'FORM':
    case 'QUIZ': {
      return type;
    }
    default: {
      return 'OTHER' as const;
    }
  }
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function taskMutationToAssessmentItemPayload(body: AssignmentTaskMutationPayload) {
  const assignmentType = normalizeTaskType(body.assignment_type);
  const contents = normalizeRecord(body.contents);
  const title = body.title ?? '';
  const max_score = normalizeNumber(body.max_grade_value);

  if (assignmentType === 'FILE_SUBMISSION') {
    return {
      kind: 'FILE_UPLOAD',
      title,
      max_score,
      body: {
        kind: 'FILE_UPLOAD',
        prompt: body.description ?? '',
        max_files: Math.max(1, normalizeNumber(contents.max_files, 1)),
        max_mb: contents.max_file_size_mb === null ? null : normalizeNumber(contents.max_file_size_mb, 1),
        mimes: normalizeArray<string>(contents.allowed_mime_types).filter(
          (item): item is string => typeof item === 'string',
        ),
      },
    };
  }

  if (assignmentType === 'FORM') {
    const questions = normalizeArray<Record<string, unknown>>(contents.questions);
    const prompt = normalizeString(questions[0]?.questionText, body.description ?? '');
    const fields = questions.flatMap((question, questionIndex) => {
      const blanks = normalizeArray<Record<string, unknown>>(question.blanks);
      return blanks.map((blank, blankIndex) => ({
        id: normalizeString(blank.blankUUID, `field_${questionIndex}_${blankIndex}`),
        label:
          normalizeString(blank.placeholder) ||
          normalizeString(question.questionText) ||
          `Field ${questionIndex + 1}.${blankIndex + 1}`,
        field_type: 'text' as const,
        required: false,
      }));
    });
    return {
      kind: 'FORM',
      title,
      max_score,
      body: {
        kind: 'FORM',
        prompt,
        fields,
      },
    };
  }

  if (assignmentType === 'QUIZ') {
    const questions = normalizeArray<Record<string, unknown>>(contents.questions);
    const question = questions[0] ?? {};
    const options = normalizeArray<Record<string, unknown>>(question.options);
    const normalizedOptions = options.map((option, index) => ({
      id: normalizeString(option.optionUUID, `option_${index}`),
      text: normalizeString(option.text),
      is_correct: option.assigned_right_answer === true,
    }));
    const correctCount = normalizedOptions.filter((option) => option.is_correct).length;
    const optionTexts = new Set(normalizedOptions.map((option) => option.text.trim().toLowerCase()));
    const isTrueFalse = normalizedOptions.length === 2 && optionTexts.has('true') && optionTexts.has('false');
    return {
      kind: 'CHOICE',
      title,
      max_score,
      body: {
        kind: 'CHOICE',
        prompt: normalizeString(question.questionText, body.description ?? ''),
        options: normalizedOptions,
        multiple: correctCount > 1,
        variant: isTrueFalse ? 'TRUE_FALSE' : correctCount > 1 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
      },
    };
  }

  const prompt = normalizeString(normalizeRecord(contents.body).prompt, body.description ?? '');
  return {
    kind: 'OPEN_TEXT',
    title,
    max_score,
    body: {
      kind: 'OPEN_TEXT',
      prompt,
    },
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
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskMutationToAssessmentItemPayload(body)),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata.success && metadata.data
    ? { ...metadata, data: toAssignmentTask(metadata.data) ?? metadata.data }
    : metadata;
}

export async function getAssignmentTask(assignmentUUID: string, assignmentTaskUUID: string) {
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}`);
  const metadata = await getResponseMetadata(result);
  if (!metadata.success || !metadata.data) return metadata;

  const assessment = metadata.data as { items?: unknown[] };
  const item = Array.isArray(assessment.items)
    ? assessment.items.find((candidate) => (candidate as { item_uuid?: string }).item_uuid === assignmentTaskUUID)
    : null;
  return {
    ...metadata,
    data: item ? (toAssignmentTask(item) ?? item) : null,
  };
}

export interface UpdateAssignmentTaskParams {
  body: AssignmentTaskMutationPayload;
  assignmentTaskUUID: string;
  assignmentUUID: string;
}

export async function updateAssignmentTask({ body, assignmentTaskUUID, assignmentUUID }: UpdateAssignmentTaskParams) {
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/items/${assignmentTaskUUID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskMutationToAssessmentItemPayload(body)),
  });
  const metadata = await getResponseMetadata(result);

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata.success && metadata.data
    ? { ...metadata, data: toAssignmentTask(metadata.data) ?? metadata.data }
    : metadata;
}

export async function deleteAssignmentTask(assignmentTaskUUID: string, assignmentUUID: string) {
  const result = await apiFetch(`assessments/${normalizeAssignmentUuid(assignmentUUID)}/items/${assignmentTaskUUID}`, {
    method: 'DELETE',
  });
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
