import CourseGradebookCommandCenter from '@/features/grading/gradebook/CourseGradebookCommandCenter';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformCourseGradebookPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'gradebook',
    children: <CourseGradebookCommandCenter courseUuid={courseuuid} />,
  });
}
