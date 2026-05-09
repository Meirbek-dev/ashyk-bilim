import EditCourseCertification from '@components/Dashboard/Pages/Course/EditCourseCertification/EditCourseCertification';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformCourseCertificatePage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'certificate',
    children: <EditCourseCertification />,
  });
}
