export {
  getAssignmentTotalPoints,
  normalizeAssignmentTasks,
  pointsToPercent,
} from '@/features/assignments/domain';
export type {
  AssignmentRead,
  AssignmentTaskRead,
  AssignmentTaskType,
} from '@/features/assignments/domain';
export {
  useAssignmentByActivity,
  useAssignmentDetail,
  useAssignmentTasks,
} from '@/features/assignments/hooks/useAssignments';
export { getTaskTypeEditor } from '@/features/assignments/studio/task-editors/registry';
export {
  patchEditorValue,
  taskToEditorValue,
} from '@/features/assignments/studio/task-editors/types';
export type { AssignmentTaskEditorValue } from '@/features/assignments/studio/task-editors/types';
