import { redirect } from '@/i18n/navigation'
import { getCourseMetadata } from '@services/courses/courses'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

interface MetadataProps {
  params: Promise<{ locale: string; courseid: string; activityid: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const t = await getTranslations({ locale: params.locale, namespace: 'DashPage.Editor' })

  const course_meta = await getCourseMetadata(params.courseid, undefined, true)

  return {
    title: t('metaTitleEdit', { activityName: course_meta.name ?? '' }),
    description: course_meta.mini_description ?? '',
  }
}

const EditActivity = async (props: { params: Promise<{ locale: string; courseid: string; activityuuid: string }> }) => {
  const { activityuuid, courseid, locale } = await props.params
  // Locale-aware: a bare `/dash/…` costs a second 307 through the proxy (UX-029).
  redirect({ href: `/dash/courses/${courseid}/activity/${activityuuid}/studio`, locale })
}

export default EditActivity
