import { getActivity } from '@services/courses/activities';
import { getCourseMetadata } from '@services/courses/courses';
import { getSession } from '@/lib/auth/session';
import { SessionProvider } from '@/components/providers/session-provider';
import { connection } from 'next/server';
import { jetBrainsMono } from '@/lib/fonts';
import type { Metadata } from 'next';

import ActivityClient from '@/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity';

interface MetadataProps {
  params: Promise<{ courseuuid: string; activityid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function fetchCourseMetadata(courseuuid: string) {
  const session = await getSession();
  return await getCourseMetadata(courseuuid, undefined, !!session);
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  await connection();
  const { courseuuid, activityid } = await props.params;
  const course_meta = await fetchCourseMetadata(courseuuid);
  const isCourseEnd = activityid === 'end';
  const activity = isCourseEnd ? null : await getActivity(activityid);

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
  await connection();
  const { courseuuid, activityid } = await props.params;
  const isCourseEnd = activityid === 'end';
  const [course_meta, activity, initialSession] = await Promise.all([
    fetchCourseMetadata(courseuuid),
    isCourseEnd ? Promise.resolve(null) : getActivity(activityid),
    getSession(),
  ]);

  return (
    <div className={jetBrainsMono.variable}>
      <SessionProvider initialSession={initialSession}>
        <ActivityClient
          activityid={activityid}
          courseuuid={courseuuid}
          activity={activity}
          course={course_meta}
        />
      </SessionProvider>
    </div>
  );
}
