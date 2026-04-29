'use client';

import PageLoading from '@components/Objects/Loaders/PageLoading';
import ErrorUI from '@/components/Objects/Elements/Error/Error';
import { createContext, use, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  useAssignmentActivity,
  useAssignmentDetail,
  useAssignmentTasks,
} from '@/features/assignments/hooks/useAssignments';
import { useCourseMetadata } from '@/features/courses/hooks/useCourseQueries';

interface AssignmentObject {
  id: number;
  assignment_uuid: string;
  title: string;
  description: string;
  due_date?: string;
  due_at?: string | null;
  published?: boolean;
  course_uuid?: string;
  activity_uuid?: string;
}

interface AssignmentTaskObject {
  id: number;
  assignment_task_uuid: string;
  title?: string;
  description?: string;
  assignment_type?: string;
  [key: string]: unknown;
}

interface CourseObject {
  id?: number;
  course_uuid: string;
}

interface ActivityObject {
  id?: number;
  activity_uuid: string;
  published?: boolean;
}

interface AssignmentContextType {
  assignment_object: AssignmentObject | null;
  assignment_tasks: AssignmentTaskObject[] | null;
  course_object: CourseObject | null;
  activity_object: ActivityObject | null;
}

export const AssignmentContext = createContext<AssignmentContextType>({
  assignment_object: null,
  assignment_tasks: null,
  course_object: null,
  activity_object: null,
});

interface GetAssignmentsFullParams {
  assignment: AssignmentObject | null | undefined;
  assignment_tasks: AssignmentTaskObject[] | null | undefined;
  course_uuid: string | null | undefined;
  course_object: CourseObject | null | undefined;
  activity_uuid: string | null | undefined;
  activity_object: ActivityObject | null | undefined;
}

const getAssignmentsFull = ({
  assignment,
  assignment_tasks,
  course_uuid,
  course_object,
  activity_uuid,
  activity_object,
}: GetAssignmentsFullParams): AssignmentContextType => {
  if (assignment && assignment_tasks && (!course_uuid || course_object) && (!activity_uuid || activity_object)) {
    return {
      assignment_object: assignment,
      assignment_tasks,
      course_object: course_object ?? null,
      activity_object: activity_object ?? null,
    };
  }

  return {
    assignment_object: null,
    assignment_tasks: null,
    course_object: null,
    activity_object: null,
  };
};

export const AssignmentProvider = ({
  children,
  assignment_uuid,
}: {
  children: ReactNode;
  assignment_uuid: string | undefined;
}) => {
  const t = useTranslations('Contexts.Assignment');

  const { data: assignment, error: assignmentError } = useAssignmentDetail(assignment_uuid);

  const { data: assignment_tasks, error: assignmentTasksError } = useAssignmentTasks(assignment_uuid);

  const course_uuid = assignment?.course_uuid;

  const { data: course_object, error: courseObjectError } = useCourseMetadata(course_uuid);

  const activity_uuid = assignment?.activity_uuid;

  const { data: activity_object, error: activityObjectError } = useAssignmentActivity(activity_uuid);

  // Derive assignmentsFull (memoized to avoid unnecessary context value changes)
  const assignmentsFull: AssignmentContextType = useMemo(
    () =>
      getAssignmentsFull({
        assignment: (assignment as AssignmentObject | null | undefined) ?? null,
        assignment_tasks: (assignment_tasks as AssignmentTaskObject[] | null | undefined) ?? null,
        course_uuid,
        course_object: (course_object as CourseObject | null | undefined) ?? null,
        activity_uuid,
        activity_object: (activity_object as ActivityObject | null | undefined) ?? null,
      }),
    [assignment, assignment_tasks, course_uuid, course_object, activity_uuid, activity_object],
  );

  const isLoading =
    !(assignment && assignment_tasks) || (course_uuid && !course_object) || (activity_uuid && !activity_object);
  const hasError = assignmentError || assignmentTasksError || courseObjectError || activityObjectError;

  if (hasError) return <ErrorUI message={t('loadError')} />;

  if (isLoading) return <PageLoading />;

  return <AssignmentContext.Provider value={assignmentsFull}>{children}</AssignmentContext.Provider>;
};

export function useAssignments(): AssignmentContextType {
  return use(AssignmentContext);
}
