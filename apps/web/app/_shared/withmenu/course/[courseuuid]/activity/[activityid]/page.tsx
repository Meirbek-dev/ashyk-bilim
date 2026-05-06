import { getActivity } from '@services/courses/activities';
import { getAssessmentByActivityUuid } from '@services/assessments/assessments';
import { getCourseMetadata } from '@services/courses/courses';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { jetBrainsMono } from '@/lib/fonts';
import type { Metadata } from 'next';
import { cache } from 'react';

import ActivityClient from './activity';
import { getSession } from '@/lib/auth/session';

const ASSESSABLE_TYPES = new Set(['TYPE_ASSIGNMENT', 'TYPE_EXAM', 'TYPE_CODE_CHALLENGE', 'TYPE_QUIZ']);

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

  const [course_meta, activity] = await Promise.all([
    fetchCourseMetadata(courseuuid),
    isCourseEnd ? Promise.resolve(null) : fetchActivity(activityid),
  ]);

  if (!isCourseEnd && activity && ASSESSABLE_TYPES.has(activity.activity_type ?? '')) {
    const assessment = await getAssessmentByActivityUuid(activity.activity_uuid);
    if (assessment) {
      console.info('[ASSESSMENT_FLOW_ROUTE]', {
        routeMode: 'legacy',
        surface: 'activity-redirect',
        courseUuid: courseuuid,
        activityUuid: activity.activity_uuid,
        assessmentUuid: assessment.assessment_uuid,
        kind: assessment.kind,
        targetPath: `/assessments/${assessment.assessment_uuid}`,
      });
      redirect(`/assessments/${assessment.assessment_uuid}`);
    }
  }

  return (
    <div className={jetBrainsMono.variable}>
      <ActivityClient
        activityid={activityid}
        courseuuid={courseuuid}
        activity={activity}
        course={course_meta}
      />
    </div>
  );
};

export default ActivityPage;
