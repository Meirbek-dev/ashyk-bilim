import AssessmentReviewWorkspace from '@/features/assessments/review/AssessmentReviewWorkspace';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';

export default async function PlatformAssessmentReviewPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>;
  searchParams: Promise<{ submission?: string }>;
}) {
  const { courseuuid, activityid } = await props.params;
  const { submission } = await props.searchParams;

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: (
      <AssessmentReviewWorkspace
        activityUuid={activityid}
        initialSubmissionUuid={submission ?? null}
      />
    ),
  });
}
