import CourseOverview from '@components/Dashboard/Courses/CourseOverview'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'

export default async function PlatformCourseWorkspacePage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'overview',
    children: <CourseOverview courseuuid={courseuuid} />,
  })
}
