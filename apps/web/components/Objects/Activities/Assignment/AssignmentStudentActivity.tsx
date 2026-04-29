'use client';

import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { normalizeAssignmentTasks } from '@/features/assignments/domain';
import StudentAssignmentShell from '@/features/assignments/student/StudentAssignmentShell';
import { useTranslations } from 'next-intl';

interface AssignmentObject {
  assignment_uuid: string;
  title?: string;
  due_date?: string | null;
  due_at?: string | null;
  description?: string | null;
}

interface CourseObject {
  course_uuid: string;
}

interface ActivityObject {
  id?: number;
  activity_uuid: string;
}

interface AssignmentsData {
  assignment_object?: AssignmentObject | null;
  assignment_tasks?: unknown[] | null;
  course_object?: CourseObject | null;
  activity_object?: ActivityObject | null;
}

const AssignmentStudentActivity = () => {
  const t = useTranslations('Activities.AssignmentStudentActivity');
  const assignments = useAssignments() as AssignmentsData | null;

  // Early returns for loading/error states
  if (!assignments) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-slate-500">{t('loading', { default: 'Loading assignment...' })}</p>
      </div>
    );
  }

  if (!assignments.assignment_object) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-slate-500">{t('noAssignment', { default: 'No assignment found' })}</p>
      </div>
    );
  }

  const { assignment_object, assignment_tasks, course_object, activity_object } = assignments;
  const tasks = normalizeAssignmentTasks(assignment_tasks);

  return (
    <StudentAssignmentShell
      data={{
        assignment: {
          assignment_uuid: assignment_object.assignment_uuid,
          title: assignment_object.title,
          description: assignment_object.description,
          due_at: assignment_object.due_at,
          due_date: assignment_object.due_date,
        },
        tasks,
        courseUuid: course_object?.course_uuid,
        activityUuid: activity_object?.activity_uuid,
        activityId: activity_object?.id ?? null,
      }}
    />
  );
};

export default AssignmentStudentActivity;
