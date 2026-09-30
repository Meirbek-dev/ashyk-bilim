import CourseOverview from '@components/Dashboard/Courses/CourseOverview'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { courseWorkspaceMetadata } from '@components/Dashboard/Courses/courseWorkspaceMetadata'
import { Suspense } from 'react'

interface PlatformCourseWorkspacePageProps {
  params: Promise<{ courseuuid: string }>
}

export async function generateMetadata({ params }: PlatformCourseWorkspacePageProps) {
  return courseWorkspaceMetadata((await params).courseuuid, 'overview')
}

export default function PlatformCourseWorkspacePage(props: PlatformCourseWorkspacePageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseWorkspaceContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseWorkspaceContent({ params }: PlatformCourseWorkspacePageProps) {
  const { courseuuid } = await params

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'overview',
    children: <CourseOverview courseuuid={courseuuid} />,
  })
}
