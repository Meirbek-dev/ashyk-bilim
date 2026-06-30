import { CourseCreatePage } from '@/features/courses/create'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { Suspense } from 'react'

function NewCourseFallback() {
  return <div className="bg-background min-h-screen" />
}

export default function PlatformNewCoursePage() {
  return (
    <Suspense fallback={<NewCourseFallback />}>
      <PlatformNewCourseContent />
    </Suspense>
  )
}

async function PlatformNewCourseContent() {
  await requireAnyPermission([
    { action: Actions.CREATE, resource: Resources.COURSE, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.COURSE, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.COURSE, scope: Scopes.OWN },
  ])

  return <CourseCreatePage />
}
