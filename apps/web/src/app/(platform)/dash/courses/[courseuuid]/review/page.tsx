import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';
import CourseReviewPublish from '@components/Dashboard/Courses/CourseReviewPublish';
import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server';

export default async function PlatformCourseReviewPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;
  const capabilities = await requireCourseWorkspaceStageAccess(courseuuid, 'review');

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'review',
    capabilities,
    children: (
      <CourseReviewPublish
        courseuuid={courseuuid}
        capabilities={capabilities}
      />
    ),
  });
}
