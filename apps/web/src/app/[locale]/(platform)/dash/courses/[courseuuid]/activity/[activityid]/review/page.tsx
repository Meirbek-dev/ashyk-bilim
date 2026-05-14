import AssessmentReviewWorkspace from "@/features/assessments/review/AssessmentReviewWorkspace";
import FileSubmissionReviewWorkspace from "@/features/file-submissions/review/FileSubmissionReviewWorkspace";
import { renderCourseWorkspacePage } from "@components/Dashboard/Courses/renderCourseWorkspacePage";
import { getActivity } from "@services/courses/activities";

export default async function PlatformAssessmentReviewPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>;
  searchParams: Promise<{ submission?: string }>;
}) {
  const [{ courseuuid, activityid }, { submission }] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const activity = await getActivity(activityid);

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: "curriculum",
    children:
      String(activity.activity_type) === "TYPE_FILE_SUBMISSION" ? (
        <FileSubmissionReviewWorkspace
          activityUuid={activityid}
          initialAttemptUuid={submission ?? null}
        />
      ) : (
        <AssessmentReviewWorkspace
          activityUuid={activityid}
          initialSubmissionUuid={submission ?? null}
        />
      ),
  });
}
