import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CourseCreatePage } from '@/features/courses/create'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { Suspense } from 'react'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.CourseManagement.Create' })
  return { title: t('formLabel') }
}

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
