import {
  findDraftTaskAnswer,
  getLegacyTaskSubmission,
  normalizeFormSubmission,
  normalizeQuizSubmission,
} from '@/features/assignments/domain';
import type { AssignmentDraftRead, AssignmentTaskAnswer } from '@/features/assignments/domain';
import type { Submission } from '@/features/grading/domain';

import type { AssignmentAnswerMap } from './types';

export function buildAnswerMapFromSubmission(submission: Submission | null | undefined): AssignmentAnswerMap {
  const answersJson = submission?.answers_json;
  const tasks = answersJson && typeof answersJson === 'object' ? (answersJson as { tasks?: unknown }).tasks : null;
  if (!Array.isArray(tasks)) return {};

  return Object.fromEntries(
    (tasks as AssignmentTaskAnswer[])
      .filter((answer) => typeof answer?.task_uuid === 'string')
      .map((answer) => [answer.task_uuid, answer]),
  );
}

export function buildAnswerMapFromDraft(draft: AssignmentDraftRead | null | undefined): AssignmentAnswerMap {
  return buildAnswerMapFromSubmission(draft?.submission ?? null);
}

export function answerMapToPatch(answerMap: AssignmentAnswerMap) {
  return {
    tasks: Object.values(answerMap),
  };
}

export function getInitialAnswerForTask(
  draft: AssignmentDraftRead | null | undefined,
  fallbackSubmission: Submission | null | undefined,
  taskUuid: string,
): AssignmentTaskAnswer | null {
  return findDraftTaskAnswer(draft, taskUuid) ?? buildAnswerMapFromSubmission(fallbackSubmission)[taskUuid] ?? null;
}

export function normalizeQuizAnswer(answer: AssignmentTaskAnswer | null) {
  return normalizeQuizSubmission(answer?.quiz_answers ?? getLegacyTaskSubmission(answer) ?? answer);
}

export function normalizeFormAnswer(answer: AssignmentTaskAnswer | null) {
  return normalizeFormSubmission(answer?.form_data ?? getLegacyTaskSubmission(answer) ?? answer);
}

export function areAnswerMapsEqual(a: AssignmentAnswerMap, b: AssignmentAnswerMap): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
