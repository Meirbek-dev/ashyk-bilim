import EditCourseContributors from '@components/Dashboard/Pages/Course/EditCourseContributors/EditCourseContributors';
import EditCourseAccess from '@components/Dashboard/Pages/Course/EditCourseAccess/EditCourseAccess';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';
import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server';

export default async function PlatformCourseAccessPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;
  const capabilities = await requireCourseWorkspaceStageAccess(courseuuid, 'access');

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'access',
    capabilities,
    children: (
      <div className="space-y-8">
        {capabilities.canManageAccess ? <EditCourseAccess /> : null}
        {capabilities.canManageCollaboration ? <EditCourseContributors /> : null}
      </div>
    ),
  });
}
