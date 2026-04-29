import type { AssignmentTaskRead, AssignmentTaskAnswer } from '@/features/assignments/domain';

export type AssignmentAnswerMap = Record<string, AssignmentTaskAnswer>;

export interface StudentAssignmentData {
  assignment_uuid: string;
  title?: string;
  description?: string | null;
  due_at?: string | null;
  due_date?: string | null;
}

export interface StudentAssignmentContextData {
  assignment: StudentAssignmentData;
  tasks: AssignmentTaskRead[];
  courseUuid?: string | null;
  activityUuid?: string | null;
  activityId?: number | null;
}

export interface AttemptProps {
  task: AssignmentTaskRead;
  answer: AssignmentTaskAnswer | null;
  disabled?: boolean;
  onChange: (answer: AssignmentTaskAnswer) => void;
}
