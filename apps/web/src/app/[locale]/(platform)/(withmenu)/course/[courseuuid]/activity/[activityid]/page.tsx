import { getActivity } from '@services/courses/activities'
import { getCourseMetadata } from '@services/courses/courses'
import { getSession } from '@/lib/auth/session'
import { jetBrainsMono } from '@/lib/fonts'
import type { Metadata } from 'next'
import { cache } from 'react'
import { getStudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { redirect } from '@/i18n/navigation'
import { getLocale } from 'next-intl/server'
import AccessDenied from '@/components/Errors/AccessDenied'

import ActivityClient from '@/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity'

interface MetadataProps {
  params: Promise<{ courseuuid: string; activityid: string }>
}

const fetchCourseMetadata = cache(async (courseuuid: string) => {
  const session = await getSession()
  return await getCourseMetadata(courseuuid, undefined, !!session)
})

const fetchActivity = cache(async (activityid: string) => getActivity(activityid))

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { courseuuid, activityid } = await props.params
  try {
    const course_meta = await fetchCourseMetadata(courseuuid)
    const isCourseEnd = activityid === 'end'
    const activity = isCourseEnd ? null : await fetchActivity(activityid)

    const pageTitle = isCourseEnd ? `Course End - ${course_meta.name}` : `${activity?.name ?? ''} - ${course_meta.name}`

    return {
      title: pageTitle,
      description: course_meta.description,
      keywords: course_meta.learnings,
      robots: {
        index: true,
        follow: true,
        nocache: true,
        googleBot: {
          index: true,
          follow: true,
          'max-image-preview': 'large',
        },
      },
      openGraph: {
        title: pageTitle,
        description: course_meta.description,
        publishedTime: course_meta.creation_date,
        tags: course_meta.learnings,
      },
    }
  } catch (error: unknown) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: `Access Denied`,
      }
    }
    throw error
  }
}

export default async function PlatformActivityPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>
}) {
  const { courseuuid, activityid } = await props.params
  const isCourseEnd = activityid === 'end'

  let course_meta
  let activity
  let runtime
  try {
    ;[course_meta, activity, runtime] = await Promise.all([
      fetchCourseMetadata(courseuuid),
      isCourseEnd ? Promise.resolve(null) : fetchActivity(activityid),
      isCourseEnd ? Promise.resolve(null) : getStudentActivityRuntime(courseuuid, activityid),
    ])
  } catch (error: unknown) {
    if (error.status === 401) {
      const locale = await getLocale()
      redirect({
        href: `/login?returnTo=${encodeURIComponent(`/course/${courseuuid}/activity/${activityid}`)}`,
        locale,
      })
    }
    if (error.status === 403) {
      const activeSession = await getSession()
      return <AccessDenied courseuuid={courseuuid} session={activeSession} />
    }
    throw error
  }

  return (
    <div className={jetBrainsMono.variable}>
      <ActivityClient
        activityid={activityid}
        courseuuid={courseuuid}
        activity={activity}
        course={course_meta}
        runtime={runtime}
      />
    </div>
  )
}
