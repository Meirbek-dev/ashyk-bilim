import CurriculumEditor from '@components/Dashboard/Pages/Course/EditCourseStructure/CurriculumEditor';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformCourseCurriculumPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: <CurriculumEditor />,
  });
}
