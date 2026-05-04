import AssessmentStudioWorkspace from '@/features/assessments/studio/AssessmentStudioWorkspace';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';
import { getActivity } from '@services/courses/activities';
import { getCourseMetadata } from '@services/courses/courses';
import EditorWrapper from '@/components/Objects/Editor/EditorWrapper';

const ASSESSABLE_TYPES = new Set(['TYPE_ASSIGNMENT', 'TYPE_EXAM', 'TYPE_CODE_CHALLENGE', 'TYPE_QUIZ']);

export default async function PlatformAssessmentStudioPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>;
}) {
  const { courseuuid, activityid } = await props.params;

  const [activity, course] = await Promise.all([getActivity(activityid), getCourseMetadata(courseuuid, undefined, true)]);

  const isAssessment = ASSESSABLE_TYPES.has(activity.activity_type ?? '');

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: isAssessment ? (
      <AssessmentStudioWorkspace
        courseUuid={courseuuid}
        activityUuid={activityid}
      />
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
        Studio is not yet available for {activity.activity_type?.replace('TYPE_', '').toLowerCase() || 'this'} activities.
      </div>
    ),
  });
}
