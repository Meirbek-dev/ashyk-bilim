import { getActivity } from '@services/courses/activities'
import { getCourseMetadata } from '@services/courses/courses'
import { getSession } from '@/lib/auth/session'
import { jetBrainsMono } from '@/lib/fonts'
import type { Metadata } from 'next'
import { cache, Suspense } from 'react'
import { getStudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { redirect } from '@/i18n/navigation'
import { getLocale, setRequestLocale } from 'next-intl/server'
import AccessDenied from '@/components/Errors/AccessDenied'
import ResourceNotFound from '@/components/Errors/ResourceNotFound'

import ActivityClient from '@/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity'
import type { CourseStructure } from '@components/Contexts/CourseContext'

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

    const courseName = course_meta.name ?? ''
    const courseDescription = course_meta.description ?? ''
    const courseKeywords = Array.isArray(course_meta.learnings)
      ? course_meta.learnings.filter((value): value is string => typeof value === 'string')
      : typeof course_meta.learnings === 'string'
        ? [course_meta.learnings]
        : []
    const pageTitle = isCourseEnd ? `Course End - ${courseName}` : `${activity?.name ?? ''} - ${courseName}`

    return {
      title: pageTitle,
      description: courseDescription,
      keywords: courseKeywords,
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
        description: courseDescription,
        publishedTime: course_meta.creation_date,
        tags: courseKeywords,
      },
    }
  } catch (error: unknown) {
    const apiError = error as AppApiError
    if (apiError.status === 401 || apiError.status === 403) {
      return {
        title: `Access Denied`,
      }
    }
    throw error
  }
}

interface PlatformActivityPageProps {
  params: Promise<{ locale: string; courseuuid: string; activityid: string }>
}

function ActivityPageFallback() {
  return <div className="bg-background min-h-screen" />
}

export default function PlatformActivityPage(props: PlatformActivityPageProps) {
  return (
    <Suspense fallback={<ActivityPageFallback />}>
      <PlatformActivityContent params={props.params} />
    </Suspense>
  )
}

async function PlatformActivityContent({ params }: PlatformActivityPageProps) {
  const { locale, courseuuid, activityid } = await params
  setRequestLocale(locale)
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
    const apiError = error as AppApiError
    if (apiError.status === 401) {
      const activeLocale = await getLocale()
      redirect({
        href: `/login?returnTo=${encodeURIComponent(`/course/${courseuuid}/activity/${activityid}`)}`,
        locale: activeLocale,
      })
    }
    if (apiError.status === 403) {
      const activeSession = await getSession()
      return <AccessDenied courseuuid={courseuuid} session={activeSession} />
    }
    if (apiError.status === 404) {
      const activeSession = await getSession()
      return <ResourceNotFound type="activity" courseuuid={courseuuid} session={activeSession} />
    }
    throw error
  }

  const course: CourseStructure = {
    ...course_meta,
    chapters: (course_meta?.chapters ?? []).map(chapter =>
      Object.assign(chapter, { activities: chapter.activities ?? [] }),
    ),
  }

  return (
    <div className={jetBrainsMono.variable}>
      <ActivityClient
        activityid={activityid}
        courseuuid={courseuuid}
        activity={activity}
        course={course}
        runtime={runtime}
      />
    </div>
  )
}
