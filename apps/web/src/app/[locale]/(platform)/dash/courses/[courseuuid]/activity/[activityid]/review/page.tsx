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
import { Suspense } from 'react'

interface PlatformAssessmentReviewPageProps {
  params: Promise<{ courseuuid: string; activityid: string }>
  searchParams: Promise<{ submission?: string }>
}

export default function PlatformAssessmentReviewPage(props: PlatformAssessmentReviewPageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformAssessmentReviewContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  )
}

async function PlatformAssessmentReviewContent({ params, searchParams }: PlatformAssessmentReviewPageProps) {
  const [{ courseuuid, activityid }, { submission }] = await Promise.all([params, searchParams])

  let activity
  let assessment: Awaited<ReturnType<typeof getAssessmentByActivityUuid>> | null
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
