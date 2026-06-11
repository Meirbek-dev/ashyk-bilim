import AssessmentReviewWorkspace from '@/features/assessments/review/AssessmentReviewWorkspace'
import FileSubmissionReviewWorkspace from '@/features/file-submissions/review/FileSubmissionReviewWorkspace'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { getAssessmentByActivityUuid } from '@services/assessments/assessments'
import { getActivity } from '@services/courses/activities'
import AccessDenied from '@/components/Errors/AccessDenied'
import ResourceNotFound from '@/components/Errors/ResourceNotFound'
import { getSession } from '@/lib/auth/session'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'

export default async function PlatformAssessmentReviewPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>
  searchParams: Promise<{ submission?: string }>
}) {
  const [{ courseuuid, activityid }, { submission }] = await Promise.all([props.params, props.searchParams])

  let activity
  let assessment = null
  try {
    activity = await getActivity(activityid)
    const isAssessable =
      activity.activity_type === 'TYPE_EXAM' ||
      activity.activity_type === 'TYPE_CODE_CHALLENGE' ||
      activity.activity_type === 'TYPE_CUSTOM'
    assessment = isAssessable ? await getAssessmentByActivityUuid(activity.activity_uuid) : null
  } catch (error: unknown) {
    const apiError = error as AppApiError
    if (apiError.status === 401) {
      const locale = await getLocale()
      redirect({
        href: `/login?returnTo=${encodeURIComponent(`/dash/courses/${courseuuid}/activity/${activityid}/review`)}`,
        locale,
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

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: assessment ? (
      <AssessmentReviewWorkspace activityUuid={activityid} initialSubmissionUuid={submission ?? null} />
    ) : (
      <FileSubmissionReviewWorkspace activityUuid={activityid} initialAttemptUuid={submission ?? null} />
    ),
  })
}
