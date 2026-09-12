import EditCourseGeneral from '@components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { courseWorkspaceMetadata } from '@components/Dashboard/Courses/courseWorkspaceMetadata'
import { Suspense } from 'react'

interface PlatformCourseDetailsPageProps {
  params: Promise<{ courseuuid: string }>
}

export async function generateMetadata({ params }: PlatformCourseDetailsPageProps) {
  return courseWorkspaceMetadata((await params).courseuuid, 'details')
}

export default function PlatformCourseDetailsPage(props: PlatformCourseDetailsPageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseDetailsContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseDetailsContent({ params }: PlatformCourseDetailsPageProps) {
  const { courseuuid } = await params

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'details',
    children: <EditCourseGeneral />,
  })
}
