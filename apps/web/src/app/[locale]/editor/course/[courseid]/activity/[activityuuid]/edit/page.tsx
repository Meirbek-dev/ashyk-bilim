import { redirect } from 'next/navigation'
import { getCourseMetadata } from '@services/courses/courses'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

interface MetadataProps {
  params: Promise<{ courseid: string; activityid: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const t = await getTranslations('DashPage.Editor')

  const course_meta = await getCourseMetadata(params.courseid, undefined, true)

  return {
    title: t('metaTitleEdit', { activityName: course_meta.name }),
    description: course_meta.mini_description,
  }
}

const EditActivity = async (props: { params: Promise<{ courseid: string; activityuuid: string }> }) => {
  const params = await props.params
  const { activityuuid, courseid } = params
  redirect(`/dash/courses/${courseid}/activity/${activityuuid}/studio`)
}

export default EditActivity
