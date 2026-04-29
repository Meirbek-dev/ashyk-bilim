import { isPublishedToStudent } from '@/features/grading/domain';
import type { Submission } from '@/features/grading/domain';

import { getAssignmentTotalPoints, getTaskMaxPoints } from './scoring';
import {
  canArchiveAssignment,
  canPublishAssignment,
  canScheduleAssignment,
  isAssignmentEditable,
} from './workflow';
import type {
  AssignmentRead,
  AssignmentStudioViewModel,
  AssignmentTaskRead,
  AssignmentValidationIssue,
  StudentAttemptViewModel,
} from './types';

export function normalizeAssignmentTasks(tasks: unknown): AssignmentTaskRead[] {
  if (!Array.isArray(tasks)) return [];

  return tasks
    .filter((task): task is Record<string, unknown> => Boolean(task) && typeof task === 'object')
    .map((task, index) => ({
      id: typeof task.id === 'number' ? task.id : index,
      assignment_task_uuid:
        typeof task.assignment_task_uuid === 'string' ? task.assignment_task_uuid : `assignment_task_${index}`,
      assignment_type: isAssignmentTaskType(task.assignment_type) ? task.assignment_type : 'OTHER',
      title: typeof task.title === 'string' ? task.title : '',
      description: typeof task.description === 'string' ? task.description : '',
      hint: typeof task.hint === 'string' ? task.hint : null,
      reference_file: typeof task.reference_file === 'string' ? task.reference_file : null,
      max_grade_value: typeof task.max_grade_value === 'number' ? task.max_grade_value : 0,
      contents: task.contents && typeof task.contents === 'object' ? (task.contents as Record<string, unknown>) : null,
      order: typeof task.order === 'number' ? task.order : null,
    }))
    .toSorted((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
}

export function buildAssignmentStudioViewModel(
  assignment: AssignmentRead,
  rawTasks: unknown,
): AssignmentStudioViewModel {
  const tasks = normalizeAssignmentTasks(rawTasks);
  const validationIssues = validateAssignmentForPublish(assignment, tasks);

  return {
    surface: 'ASSIGNMENT_STUDIO',
    assignment,
    tasks,
    lifecycle: assignment.status,
    totalPoints: getAssignmentTotalPoints(tasks),
    isEditable: isAssignmentEditable(assignment.status),
    canPublish: canPublishAssignment(assignment.status) && validationIssues.length === 0,
    canSchedule: canScheduleAssignment(assignment.status),
    canArchive: canArchiveAssignment(assignment.status),
    validationIssues,
  };
}

export function buildStudentAttemptViewModel(
  assignment: AssignmentRead,
  rawTasks: unknown,
  submission: Submission | null,
): StudentAttemptViewModel {
  const tasks = normalizeAssignmentTasks(rawTasks);
  const status = submission?.status ?? null;

  return {
    surface: 'STUDENT_ATTEMPT',
    assignment,
    tasks,
    submission,
    totalPoints: getAssignmentTotalPoints(tasks),
    canSaveDraft: status === null || status === 'DRAFT' || status === 'RETURNED',
    canSubmit: status === null || status === 'DRAFT',
    canResubmit: status === 'RETURNED',
    resultVisible: status ? isPublishedToStudent(status) : false,
  };
}

export function validateAssignmentForPublish(
  assignment: AssignmentRead,
  tasks: AssignmentTaskRead[],
): AssignmentValidationIssue[] {
  const issues: AssignmentValidationIssue[] = [];

  if (!assignment.title.trim()) {
    issues.push({ code: 'MISSING_TITLE', message: 'Assignment title is required.' });
  }

  if (tasks.length === 0) {
    issues.push({ code: 'NO_TASKS', message: 'At least one task is required.' });
  }

  for (const task of tasks) {
    if (!task.title.trim()) {
      issues.push({
        code: 'TASK_MISSING_TITLE',
        message: 'Task title is required.',
        taskUuid: task.assignment_task_uuid,
      });
    }

    if (getTaskMaxPoints(task) <= 0) {
      issues.push({
        code: 'TASK_ZERO_POINTS',
        message: 'Task must have a positive point value.',
        taskUuid: task.assignment_task_uuid,
      });
    }

    if (task.assignment_type !== 'FILE_SUBMISSION' && !hasTaskContent(task)) {
      issues.push({
        code: 'TASK_MISSING_CONTENT',
        message: 'Task content is required.',
        taskUuid: task.assignment_task_uuid,
      });
    }
  }

  return issues;
}

function hasTaskContent(task: AssignmentTaskRead): boolean {
  const questions = task.contents?.questions;
  return Array.isArray(questions) && questions.length > 0;
}

function isAssignmentTaskType(value: unknown): value is AssignmentTaskRead['assignment_type'] {
  return value === 'FILE_SUBMISSION' || value === 'QUIZ' || value === 'FORM' || value === 'OTHER';
}
