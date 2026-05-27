import { getActivity } from '@services/courses/activities';
import { getCourseMetadata } from '@services/courses/courses';
import { getSession } from '@/lib/auth/session';
import { jetBrainsMono } from '@/lib/fonts';
import type { Metadata } from 'next';
import { cache } from 'react';
import { getStudentActivityRuntime } from '@/features/student-activity/api/runtime';

import ActivityClient from '@/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity';

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
  const [course_meta, activity, runtime] = await Promise.all([
    fetchCourseMetadata(courseuuid),
    isCourseEnd ? Promise.resolve(null) : fetchActivity(activityid),
    isCourseEnd ? Promise.resolve(null) : getStudentActivityRuntime(courseuuid, activityid),
  ]);

  return (
    <div className={jetBrainsMono.variable}>
      <ActivityClient
        activityid={activityid}
        courseuuid={courseuuid}
        activity={activity}
        course={course_meta}
        runtime={runtime}
      />
    </div>
  );
}
