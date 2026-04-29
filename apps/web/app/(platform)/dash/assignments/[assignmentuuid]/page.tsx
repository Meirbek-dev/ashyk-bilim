'use client';

import { useParams, useSearchParams } from 'next/navigation';

import { AssignmentProvider } from '@components/Contexts/Assignments/AssignmentContext';
import AssignmentSubmissionsSubPage from '@/app/_shared/dash/assignments/[assignmentuuid]/subpages/AssignmentSubmissionsSubPage';
import AssignmentStudioRoute from '@/features/assignments/studio/AssignmentStudioShell';

const PlatformAssignmentPage = () => {
  const params = useParams<{ assignmentuuid: string }>();
  const searchParams = useSearchParams();
  const subpage = searchParams.get('subpage');

  if (subpage === 'submissions' || subpage === 'review') {
    return (
      <AssignmentProvider assignment_uuid={`assignment_${params.assignmentuuid}`}>
        <AssignmentSubmissionsSubPage assignment_uuid={params.assignmentuuid} />
      </AssignmentProvider>
    );
  }

  return <AssignmentStudioRoute assignmentUuid={params.assignmentuuid} />;
};

export default PlatformAssignmentPage;
