import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext';
import { getActivity } from '@services/courses/activities';
import EditorWrapper from '@components/Objects/Editor/EditorWrapper';
import { getCourseMetadata } from '@services/courses/courses';
import { getPlatform } from '@/services/platform/platform';
import { getTranslations } from 'next-intl/server';
import { jetBrainsMono } from '@/lib/fonts';
import { connection } from 'next/server';
import type { Metadata } from 'next';

interface MetadataProps {
  params: Promise<{ courseid: string; activityid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  await connection();
  const params = await props.params;
  const t = await getTranslations('DashPage.Editor');

  const course_meta = await getCourseMetadata(params.courseid, undefined, true);

  return {
    title: t('metaTitleEdit', { activityName: course_meta.name }),
    description: course_meta.mini_description,
  };
}

const EditActivity = async (props: { params: Promise<{ courseid: string; activityuuid: string }> }) => {
  await connection();
  const params = await props.params;
  const { activityuuid, courseid } = params;

  const [courseInfo, activity] = await Promise.all([
    getCourseMetadata(courseid, undefined, true),
    getActivity(activityuuid),
  ]);

  const platform = await getPlatform();

  return (
    <div className={jetBrainsMono.variable}>
      <EditorOptionsProvider options={{ isEditable: true, mode: 'authoring' }}>
        <EditorWrapper
          platform={platform}
          course={courseInfo}
          activity={activity}
          content={typeof activity.content === 'string' ? JSON.parse(activity.content) : activity.content}
        />
      </EditorOptionsProvider>
    </div>
  );
};

export default EditActivity;
