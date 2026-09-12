import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getCourseMetadata } from '@services/courses/courses'
import { getActivity } from '@services/courses/activities'

type WorkspaceTab = 'overview' | 'details' | 'content' | 'gradebook' | 'settings' | 'certificate' | 'publish'

/**
 * `<course name> · <section>` for the course workspace pages (the dash layout
 * template appends the app name). The course GET is the same one the page
 * renders from, so Next's request memoization makes it free; a failure (401 /
 * 403/404) falls back to the section name and lets the page report it.
 */
export async function courseWorkspaceMetadata(courseuuid: string, tab: WorkspaceTab): Promise<Metadata> {
  const t = await getTranslations('DashPage.CourseManagement.Workspace')
  const section = t(`tabs.${tab}`)
  const course = await getCourseMetadata(courseuuid, undefined, true).catch(() => null)
  return { title: course?.name ? `${course.name} · ${section}` : section }
}

/** `<course name> · <activity name>` for the studio and review pages; both GETs are the ones the page renders from. */
export async function activityWorkspaceMetadata(courseuuid: string, activityid: string): Promise<Metadata> {
  const [course, activity] = await Promise.all([
    getCourseMetadata(courseuuid, undefined, true).catch(() => null),
    getActivity(activityid).catch(() => null),
  ])
  const title = [course?.name, activity?.name].filter(Boolean).join(' · ')
  return title ? { title } : {}
}
