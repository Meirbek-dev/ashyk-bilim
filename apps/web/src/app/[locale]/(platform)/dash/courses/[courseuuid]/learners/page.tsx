import CourseLearners from '@components/Dashboard/Pages/Course/CourseLearners/CourseLearners'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { courseWorkspaceMetadata } from '@components/Dashboard/Courses/courseWorkspaceMetadata'
import { Suspense } from 'react'

interface PlatformCourseLearnersPageProps {
  params: Promise<{ courseuuid: string }>
}

export async function generateMetadata({ params }: PlatformCourseLearnersPageProps) {
  return courseWorkspaceMetadata((await params).courseuuid, 'learners')
}

export default function PlatformCourseLearnersPage(props: PlatformCourseLearnersPageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseLearnersContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseLearnersContent({ params }: PlatformCourseLearnersPageProps) {
  const { courseuuid } = await params
  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'learners',
    children: <CourseLearners />,
  })
}
