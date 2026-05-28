import AssessmentReviewWorkspace from '@/features/assessments/review/AssessmentReviewWorkspace'
import FileSubmissionReviewWorkspace from '@/features/file-submissions/review/FileSubmissionReviewWorkspace'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { getAssessmentByActivityUuid } from '@services/assessments/assessments'
import { getActivity } from '@services/courses/activities'

export default async function PlatformAssessmentReviewPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>
  searchParams: Promise<{ submission?: string }>
}) {
  const [{ courseuuid, activityid }, { submission }] = await Promise.all([props.params, props.searchParams])
  const activity = await getActivity(activityid)
  const assessment = await getAssessmentByActivityUuid(activity.activity_uuid)

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
