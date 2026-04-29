import type { AssignmentDraftRead, AssignmentTaskAnswer } from './types';

export interface QuizSubmissionState {
  answers: Record<string, string[]>;
}

export interface FormSubmissionState {
  answers: Record<string, string>;
}

export const EMPTY_QUIZ_SUBMISSION: QuizSubmissionState = { answers: {} };
export const EMPTY_FORM_SUBMISSION: FormSubmissionState = { answers: {} };

export function getDraftTaskAnswers(draft: AssignmentDraftRead | null | undefined): AssignmentTaskAnswer[] {
  const answersJson = draft?.submission?.answers_json;
  const tasks = answersJson && typeof answersJson === 'object' ? (answersJson as { tasks?: unknown }).tasks : null;
  return Array.isArray(tasks) ? (tasks as AssignmentTaskAnswer[]) : [];
}

export function findDraftTaskAnswer(
  draft: AssignmentDraftRead | null | undefined,
  assignmentTaskUuid: string,
): AssignmentTaskAnswer | null {
  return getDraftTaskAnswers(draft).find((task) => task.task_uuid === assignmentTaskUuid) ?? null;
}

export function getLegacyTaskSubmission(answer: AssignmentTaskAnswer | null): unknown {
  const metadata = answer?.answer_metadata;
  return metadata && typeof metadata === 'object' && 'task_submission' in metadata ? metadata.task_submission : null;
}

export function normalizeQuizSubmission(value: unknown): QuizSubmissionState {
  const answers =
    value && typeof value === 'object' && 'answers' in value && value.answers && typeof value.answers === 'object'
      ? Object.fromEntries(
          Object.entries(value.answers as Record<string, unknown>).map(([questionId, selected]) => [
            questionId,
            Array.isArray(selected) ? selected.filter((item): item is string => typeof item === 'string') : [],
          ]),
        )
      : {};

  return { answers };
}

export function normalizeFormSubmission(value: unknown): FormSubmissionState {
  const answers =
    value && typeof value === 'object' && 'answers' in value && value.answers && typeof value.answers === 'object'
      ? Object.fromEntries(
          Object.entries(value.answers as Record<string, unknown>).map(([blankId, answer]) => [
            blankId,
            typeof answer === 'string' ? answer : '',
          ]),
        )
      : {};

  return { answers };
}
