'use client';

/**
 * AssignmentSubmissionsSubPage
 *
 * Teacher view for all student submissions on an assignment.
 *
 * Replaced the previous 3-column Kanban board that:
 * - Loaded ALL submissions at once (no pagination)
 * - Had no filtering, searching, or sorting
 * - Used a modal with 3 nested Context Providers and no grade input
 * - Logged all submission data to the console (console.log on line 24)
 *
 * Now renders <SubmissionsTable> which provides:
 * - Server-paginated, filtered results
 * - Status filter tabs (All / Needs Grading / Graded / Late)
 * - "Grade ▸" side panel with a real numeric score input
 * - Grading backlog count in the header
 */

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
