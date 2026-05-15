import AssessmentStudioWorkspace from '@/features/assessments/studio/AssessmentStudioWorkspace';
import FileSubmissionStudio from '@/features/file-submissions/studio/FileSubmissionStudio';
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage';
import { getAssessmentByActivityUuid } from '@services/assessments/assessments';
import { getActivity } from '@services/courses/activities';
import { getCourseMetadata } from '@services/courses/courses';
import EditorWrapper from '@/components/Objects/Editor/EditorWrapper';
import { getTranslations } from 'next-intl/server';

export default async function PlatformAssessmentStudioPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>;
}) {
  const t = await getTranslations('Features.Assessments.Studio');
  const { courseuuid, activityid } = await props.params;

  const [activity, course] = await Promise.all([
    getActivity(activityid),
    getCourseMetadata(courseuuid, undefined, true),
  ]);
  const assessment = await getAssessmentByActivityUuid(activity.activity_uuid);

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: assessment ? (
      <AssessmentStudioWorkspace
        courseUuid={courseuuid}
        activityUuid={activityid}
      />
    ) : String(activity.activity_type) === 'TYPE_FILE_SUBMISSION' ? (
      <FileSubmissionStudio
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
        {t('studioNotAvailableForType', {
          type: activity.activity_type?.replace('TYPE_', '').toLowerCase() || 'this',
        })}
      </div>
    ),
  });
}
