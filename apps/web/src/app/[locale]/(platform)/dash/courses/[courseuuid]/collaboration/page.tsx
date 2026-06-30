import { redirect } from 'next/navigation'
import { Suspense } from 'react'

interface PlatformCourseCollaborationPageProps {
  params: Promise<{ courseuuid: string }>
}

export default function PlatformCourseCollaborationPage(props: PlatformCourseCollaborationPageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseCollaborationContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseCollaborationContent({ params }: PlatformCourseCollaborationPageProps) {
  const { courseuuid } = await params
  return redirect(`/dash/courses/${courseuuid}/access`)
}
