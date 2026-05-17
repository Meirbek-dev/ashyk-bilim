import { getActivity } from '@services/courses/activities';
import { getAssessmentByActivityUuid } from '@services/assessments/assessments';
import { getCourseMetadata } from '@services/courses/courses';
import { getTranslations } from 'next-intl/server';
import { jetBrainsMono } from '@/lib/fonts';
import type { Metadata } from 'next';
import { cache } from 'react';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { courseContributorsQueryOptions, trailCurrentQueryOptions } from '@/features/courses/queries/course.query';

import ActivityClient from './activity';
import { getSession } from '@/lib/auth/session';

interface MetadataProps {
  params: Promise<{ courseuuid: string; activityid: string }>;
}

// Add this function at the top level to avoid duplicate fetches
const fetchCourseMetadata = cache(async (courseuuid: string) => {
  const session = await getSession();
  return await getCourseMetadata(courseuuid, undefined, !!session);
});

const fetchActivity = cache(async (activityid: string) => getActivity(activityid));

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { courseuuid, activityid } = await props.params;
  const t = await getTranslations('General');

  const course_meta = await fetchCourseMetadata(courseuuid);

  // Don't fetch activity if it's the end page
  const isCourseEnd = activityid === 'end';
  const activity = isCourseEnd ? null : await fetchActivity(activityid);

  // Localized page title
  const pageTitle = isCourseEnd
    ? t('courseEndTitle', { course: course_meta.name })
    : t('activityTitle', { activity: activity?.name ?? '', course: course_meta.name });

  // SEO
  return {
    title: pageTitle,
    description: course_meta.description,
    keywords: course_meta.learnings,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        'index': true,
        'follow': true,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      title: pageTitle,
      description: course_meta.description,
      publishedTime: course_meta.creation_date,
      tags: course_meta.learnings,
    },
  };
}

const ActivityPage = async (params: any) => {
  const { courseuuid, activityid } = await params.params;

  // Don't fetch activity if it's the end page
  const isCourseEnd = activityid === 'end';

  const [course_meta, activity, session] = await Promise.all([
    fetchCourseMetadata(courseuuid),
    isCourseEnd ? Promise.resolve(null) : fetchActivity(activityid),
    getSession(),
  ]);

  const assessment =
    !isCourseEnd &&
    activity &&
    ['TYPE_EXAM', 'TYPE_CODE_CHALLENGE', 'TYPE_CUSTOM'].includes(activity.activity_type ?? '')
      ? await getAssessmentByActivityUuid(activity.activity_uuid)
      : null;

  const queryClient = new QueryClient();

  if (session?.user && course_meta?.course_uuid) {
    const normalizedCourseUuid = course_meta.course_uuid.startsWith('course_')
      ? course_meta.course_uuid
      : `course_${course_meta.course_uuid}`;
    await Promise.all([
      queryClient.prefetchQuery(courseContributorsQueryOptions(normalizedCourseUuid)),
      queryClient.prefetchQuery(trailCurrentQueryOptions()),
    ]);
  }

  return (
    <div className={jetBrainsMono.variable}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ActivityClient
          activityid={activityid}
          assessmentUuid={assessment?.assessment_uuid ?? null}
          courseuuid={courseuuid}
          activity={activity}
          course={course_meta}
        />
      </HydrationBoundary>
    </div>
  );
};

export default ActivityPage;
