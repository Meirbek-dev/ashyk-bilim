'use client';

import { useTranslations } from 'next-intl';

import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import GradingReviewWorkspace from '@/features/grading/review/GradingReviewWorkspace';
import PageLoading from '@components/Objects/Loaders/PageLoading';

interface AssignmentSubmissionsSubPageProps {
  assignment_uuid: string;
}

export default function AssignmentSubmissionsSubPage({
  assignment_uuid: _assignment_uuid,
}: AssignmentSubmissionsSubPageProps) {
  const t = useTranslations('DashPage.Assignments');
  const assignments = useAssignments();
  void _assignment_uuid;

  // activity_object is fetched by AssignmentProvider and contains the numeric id
  const activityId: number | null = assignments?.activity_object?.id ?? null;

  if (!activityId) {
    return <PageLoading />;
  }

  return (
    <div className="w-full px-10 py-6">
      <GradingReviewWorkspace
        activityId={activityId}
        title={t('submissionsTitle')}
      />
    </div>
  );
}
