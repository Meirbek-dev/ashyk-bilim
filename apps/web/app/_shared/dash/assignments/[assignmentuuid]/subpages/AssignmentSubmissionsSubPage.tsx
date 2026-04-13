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

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import SubmissionsTable from '@/components/Grading/SubmissionsTable';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { AlertCircle, ClipboardList } from 'lucide-react';
import { useAssignmentSubmissions } from '@/features/assignments/hooks/useAssignments';
import { Badge } from '@/components/ui/badge';

type AssignmentSubmissionStatus = 'PENDING' | 'SUBMITTED' | 'GRADED' | 'LATE' | 'NOT_SUBMITTED';

interface AssignmentSubmissionUser {
  id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
}

interface AssignmentSubmissionRow {
  id: number;
  assignmentusersubmission_uuid: string;
  submission_status: AssignmentSubmissionStatus;
  grade: number;
  user_id: number;
  submitted_at: string | null;
  graded_at: string | null;
  user: AssignmentSubmissionUser;
}

const STATUS_VARIANTS: Record<
  AssignmentSubmissionStatus,
  'secondary' | 'default' | 'success' | 'warning' | 'destructive'
> = {
  PENDING: 'secondary',
  SUBMITTED: 'default',
  GRADED: 'success',
  LATE: 'warning',
  NOT_SUBMITTED: 'destructive',
};

const STATUS_LABEL_KEYS: Record<AssignmentSubmissionStatus, string> = {
  PENDING: 'assignmentStatusPending',
  SUBMITTED: 'assignmentStatusSubmitted',
  GRADED: 'assignmentStatusGraded',
  LATE: 'assignmentStatusLate',
  NOT_SUBMITTED: 'assignmentStatusNotSubmitted',
};

function getUserDisplayName(user: AssignmentSubmissionUser): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return fullName || user.username || user.email;
}

interface AssignmentSubmissionsSubPageProps {
  assignment_uuid: string;
}

function normalizeAssignmentUuid(assignmentUuid: string | null | undefined): string | null {
  if (!assignmentUuid) {
    return null;
  }

  return assignmentUuid.startsWith('assignment_') ? assignmentUuid : `assignment_${assignmentUuid}`;
}

export default function AssignmentSubmissionsSubPage({ assignment_uuid }: AssignmentSubmissionsSubPageProps) {
  const t = useTranslations('DashPage.Assignments');
  const assignments = useAssignments();
  const canonicalAssignmentUuid =
    assignments?.assignment_object?.assignment_uuid ?? normalizeAssignmentUuid(assignment_uuid);

  // activity_object is fetched by AssignmentProvider and contains the numeric id
  const activityId: number | null = assignments?.activity_object?.id ?? null;

  const { data: assignmentSubmissionRows, error: assignmentSubmissionRowsError } =
    useAssignmentSubmissions<AssignmentSubmissionRow>(canonicalAssignmentUuid);

  if (!activityId) {
    return <PageLoading />;
  }

  const gradedCount =
    assignmentSubmissionRows?.filter((row: AssignmentSubmissionRow) => row.submission_status === 'GRADED').length ?? 0;
  const submittedCount =
    assignmentSubmissionRows?.filter(
      (row: AssignmentSubmissionRow) => row.submission_status === 'SUBMITTED' || row.submission_status === 'LATE',
    ).length ?? 0;

  return (
    <div className="w-full px-10 py-6">
      <SubmissionsTable
        activityId={activityId}
        title={t('submissionsTitle')}
      />
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-900">
              <ClipboardList className="h-4 w-4" />
              <h2 className="text-base font-semibold">{t('assignmentStatusTitle')}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">{t('assignmentStatusDescription')}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <Badge variant="secondary">
              {t('assignmentStatusTotal', { count: assignmentSubmissionRows?.length ?? 0 })}
            </Badge>
            <Badge variant="default">{t('assignmentStatusSubmittedCount', { count: submittedCount })}</Badge>
            <Badge variant="success">{t('assignmentStatusGradedCount', { count: gradedCount })}</Badge>
          </div>
        </div>

        {assignmentSubmissionRowsError ? (
          <div className="px-5 py-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('assignmentStatusLoadErrorTitle')}</AlertTitle>
              <AlertDescription>{t('assignmentStatusLoadErrorDescription')}</AlertDescription>
            </Alert>
          </div>
        ) : !assignmentSubmissionRows ? (
          <div className="px-5 py-6 text-sm text-slate-500">{t('assignmentStatusLoading')}</div>
        ) : assignmentSubmissionRows.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">{t('assignmentStatusEmpty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('assignmentStatusLearner')}</TableHead>
                  <TableHead>{t('assignmentStatusState')}</TableHead>
                  <TableHead className="text-right">{t('assignmentStatusGrade')}</TableHead>
                  <TableHead>{t('assignmentStatusSubmittedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentSubmissionRows.map((row: AssignmentSubmissionRow) => (
                  <TableRow key={row.assignmentusersubmission_uuid}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{getUserDisplayName(row.user)}</div>
                      <div className="text-xs text-slate-500">{row.user.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[row.submission_status]}>
                        {t(STATUS_LABEL_KEYS[row.submission_status])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-900">{row.grade}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {row.submitted_at
                        ? new Date(row.submitted_at).toLocaleString()
                        : t('assignmentStatusNotYetSubmitted')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
