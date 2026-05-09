import { redirect } from 'next/navigation';
import { getCourseMetadata } from '@services/courses/courses';
import { getTranslations } from 'next-intl/server';
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
  redirect(`/dash/courses/${courseid}/activity/${activityuuid}/studio`);
};

export default EditActivity;
