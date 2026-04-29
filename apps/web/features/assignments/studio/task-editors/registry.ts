import type { AssignmentTaskType } from '@/features/assignments/domain';

import { FileTaskEditor } from './FileTaskEditor';
import { FormTaskEditor } from './FormTaskEditor';
import { QuizTaskEditor } from './QuizTaskEditor';
import { TextTaskEditor } from './TextTaskEditor';
import type { TaskTypeEditorModule } from './types';

export const TASK_TYPE_EDITORS: Record<AssignmentTaskType, TaskTypeEditorModule> = {
  FILE_SUBMISSION: FileTaskEditor,
  QUIZ: QuizTaskEditor,
  FORM: FormTaskEditor,
  OTHER: TextTaskEditor,
};

export function getTaskTypeEditor(type: AssignmentTaskType): TaskTypeEditorModule {
  return TASK_TYPE_EDITORS[type] ?? TextTaskEditor;
}
