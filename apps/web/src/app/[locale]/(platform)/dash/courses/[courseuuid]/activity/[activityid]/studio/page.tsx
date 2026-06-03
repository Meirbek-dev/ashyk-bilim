import AssessmentStudioWorkspace from '@/features/assessments/studio/AssessmentStudioWorkspace'
import FileSubmissionStudio from '@/features/file-submissions/studio/FileSubmissionStudio'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { getAssessmentByActivityUuid } from '@services/assessments/assessments'
import { getActivity } from '@services/courses/activities'
import { getCourseMetadata } from '@services/courses/courses'
import EditorWrapper from '@/components/Objects/Editor/EditorWrapper'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { redirect } from '@/i18n/navigation'
import AccessDenied from '@/components/Errors/AccessDenied'

export default async function PlatformAssessmentStudioPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>
}) {
  const t = await getTranslations('Features.Assessments.Studio')
  const { courseuuid, activityid } = await props.params

  let activity
  let course
  let assessment

  try {
    ;[activity, course] = await Promise.all([getActivity(activityid), getCourseMetadata(courseuuid, undefined, true)])
    assessment = await getAssessmentByActivityUuid(activity.activity_uuid)
  } catch (error: unknown) {
    if (error.status === 401) {
      const locale = await getLocale()
      redirect({
        href: `/login?returnTo=${encodeURIComponent(`/dash/courses/${courseuuid}/activity/${activityid}/studio`)}`,
        locale,
      })
    }
    if (error.status === 403) {
      const activeSession = await getSession()
      return <AccessDenied courseuuid={courseuuid} session={activeSession} />
    }
    throw error
  }

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: assessment ? (
      <AssessmentStudioWorkspace courseUuid={courseuuid} activityUuid={activityid} />
    ) : activity.activity_type === 'TYPE_FILE_SUBMISSION' ? (
      <FileSubmissionStudio courseUuid={courseuuid} activityUuid={activityid} />
    ) : activity.activity_type === 'TYPE_DYNAMIC' ? (
      <div className="bg-background min-h-screen">
        <EditorWrapper
          activity={activity}
          content={activity.content}
          course={{
            course_uuid: course.course_uuid,
            name: course.name,
            thumbnail_image: course.thumbnail_image,
          }}
          platform={null}
        />
      </div>
    ) : (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
        {t('studioNotAvailableForType', {
          type: activity.activity_type?.replace('TYPE_', '').toLowerCase() || 'this',
        })}
      </div>
    ),
  })
}
