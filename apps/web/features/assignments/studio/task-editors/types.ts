import type { AssignmentTaskRead, AssignmentTaskType } from '@/features/assignments/domain';
import type { ReactNode } from 'react';

export interface AssignmentTaskEditorValue {
  assignment_task_uuid: string;
  assignment_type: AssignmentTaskType;
  title: string;
  description: string;
  hint: string;
  max_grade_value: number;
  contents: Record<string, unknown>;
}

export interface TaskEditorValidationIssue {
  code: string;
  message: string;
}

export interface TaskTypeEditorProps {
  value: AssignmentTaskEditorValue;
  disabled?: boolean;
  onChange: (nextValue: AssignmentTaskEditorValue) => void;
}

export interface TaskTypeEditorModule {
  type: AssignmentTaskType;
  label: string;
  description: string;
  buildDefaultContents: () => Record<string, unknown>;
  validate: (value: AssignmentTaskEditorValue) => TaskEditorValidationIssue[];
  getPreviewPayload: (value: AssignmentTaskEditorValue) => Record<string, unknown>;
  Component: (props: TaskTypeEditorProps) => ReactNode;
}

export function taskToEditorValue(task: AssignmentTaskRead): AssignmentTaskEditorValue {
  return {
    assignment_task_uuid: task.assignment_task_uuid,
    assignment_type: task.assignment_type,
    title: task.title ?? '',
    description: task.description ?? '',
    hint: task.hint ?? '',
    max_grade_value: task.max_grade_value > 0 ? task.max_grade_value : 1,
    contents: task.contents ?? {},
  };
}

export function patchEditorValue(
  value: AssignmentTaskEditorValue,
  patch: Partial<AssignmentTaskEditorValue>,
): AssignmentTaskEditorValue {
  return { ...value, ...patch };
}
