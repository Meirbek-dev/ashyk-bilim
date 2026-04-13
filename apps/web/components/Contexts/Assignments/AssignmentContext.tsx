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

interface AssignmentContextType {
  assignment_object: any | null;
  assignment_tasks: any[] | null;
  course_object: any | null;
  activity_object: any | null;
}

export const AssignmentContext = createContext<AssignmentContextType>({
  assignment_object: null,
  assignment_tasks: null,
  course_object: null,
  activity_object: null,
});

interface GetAssignmentsFullParams {
  assignment: any;
  assignment_tasks: any[] | null;
  course_uuid: string | undefined;
  course_object: any | null;
  activity_uuid: string | undefined;
  activity_object: any | null;
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
      course_object,
      activity_object,
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
        assignment,
        assignment_tasks,
        course_uuid,
        course_object,
        activity_uuid,
        activity_object,
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
