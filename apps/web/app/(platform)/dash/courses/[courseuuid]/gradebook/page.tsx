import CourseGradebook from '@/components/Grading/CourseGradebook';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformCourseGradebookPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'gradebook',
    children: <CourseGradebook courseUuid={courseuuid} />,
  });
}
