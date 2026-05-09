import EditCourseGeneral from '@components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformCourseDetailsPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'details',
    children: <EditCourseGeneral />,
  });
}
