import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import { CourseCreateForm } from './CourseCreateForm'

export async function CourseCreatePage() {
  const t = await getTranslations('DashPage.CourseManagement.Create')

  return (
    <>
      <DashHeader
        breadcrumbType="courses"
        lastBreadcrumb={t('header.title')}
        title={t('header.title')}
        description={t('header.description')}
      />

      <div className="max-w-3xl px-4 py-6 md:px-8">
        <Suspense>
          <CourseCreateForm />
        </Suspense>
      </div>
    </>
  )
}
