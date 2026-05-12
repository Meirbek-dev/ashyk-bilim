import { redirect } from 'next/navigation';
import { getActivity } from '@services/courses/activities';
import { getCourseMetadata } from '@services/courses/courses';
import { getSession } from '@/lib/auth/session';
import { SessionProvider } from '@/components/providers/session-provider';
import { jetBrainsMono } from '@/lib/fonts';
import type { Metadata } from 'next';
import { cache } from 'react';
import { getAssessmentByActivityUuid } from '@services/assessments/assessments';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { courseContributorsQueryOptions } from '@/features/courses/queries/course.query';

import ActivityClient from '@/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity';

const ASSESSABLE_TYPES = new Set(['TYPE_ASSIGNMENT', 'TYPE_EXAM', 'TYPE_CODE_CHALLENGE', 'TYPE_QUIZ']);

interface MetadataProps {
  params: Promise<{ courseuuid: string; activityid: string }>;
}

const fetchCourseMetadata = cache(async (courseuuid: string) => {
  const session = await getSession();
  return await getCourseMetadata(courseuuid, undefined, !!session);
});

const fetchActivity = cache(async (activityid: string) => getActivity(activityid));

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { courseuuid, activityid } = await props.params;
  const course_meta = await fetchCourseMetadata(courseuuid);
  const isCourseEnd = activityid === 'end';
  const activity = isCourseEnd ? null : await fetchActivity(activityid);

  const pageTitle = isCourseEnd ? `Course End - ${course_meta.name}` : `${activity?.name ?? ''} - ${course_meta.name}`;

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

export default async function PlatformActivityPage(props: {
  params: Promise<{ courseuuid: string; activityid: string }>;
}) {
  const { courseuuid, activityid } = await props.params;
  const isCourseEnd = activityid === 'end';
  const [course_meta, activity, initialSession] = await Promise.all([
    fetchCourseMetadata(courseuuid),
    isCourseEnd ? Promise.resolve(null) : fetchActivity(activityid),
    getSession(),
  ]);

  // Redirect assessable activities to the canonical assessment URL.
  if (!isCourseEnd && activity && ASSESSABLE_TYPES.has(activity.activity_type ?? '')) {
    const assessment = await getAssessmentByActivityUuid(activity.activity_uuid);
    if (assessment) {
      redirect(`/assessments/${assessment.assessment_uuid}`);
    }
  }

  const queryClient = new QueryClient();

  if (initialSession?.user && course_meta?.course_uuid) {
    const normalizedCourseUuid = course_meta.course_uuid.startsWith('course_')
      ? course_meta.course_uuid
      : `course_${course_meta.course_uuid}`;
    await queryClient.prefetchQuery(courseContributorsQueryOptions(normalizedCourseUuid));
  }

  return (
    <div className={jetBrainsMono.variable}>
      <SessionProvider initialSession={initialSession}>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <ActivityClient
            activityid={activityid}
            courseuuid={courseuuid}
            activity={activity}
            course={course_meta}
          />
        </HydrationBoundary>
      </SessionProvider>
    </div>
  );
}
