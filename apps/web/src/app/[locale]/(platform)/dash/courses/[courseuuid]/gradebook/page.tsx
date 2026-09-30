import CourseGradebookCommandCenter from '@/features/grading/gradebook/CourseGradebookCommandCenter'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { courseWorkspaceMetadata } from '@components/Dashboard/Courses/courseWorkspaceMetadata'
import { Suspense } from 'react'

interface PlatformCourseGradebookPageProps {
  params: Promise<{ courseuuid: string }>
}

export async function generateMetadata({ params }: PlatformCourseGradebookPageProps) {
  return courseWorkspaceMetadata((await params).courseuuid, 'gradebook')
}

export default function PlatformCourseGradebookPage(props: PlatformCourseGradebookPageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseGradebookContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseGradebookContent({ params }: PlatformCourseGradebookPageProps) {
  const { courseuuid } = await params

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'gradebook',
    children: <CourseGradebookCommandCenter courseUuid={courseuuid} />,
  })
}
