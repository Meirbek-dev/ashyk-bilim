import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cache } from 'react';

import { getSession } from '@/lib/auth/session';
import { SessionProvider } from '@/components/providers/session-provider';
import { jetBrainsMono } from '@/lib/fonts';
import { getAssessmentByUuid } from '@services/assessments/assessments';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { assessmentByActivityQueryOptions } from '@/features/assessments/queries';
import AssessmentAttemptClient from './AssessmentAttemptClient';

interface Props {
  params: Promise<{ assessmentUuid: string }>;
}

const fetchAssessment = cache((assessmentUuid: string) => getAssessmentByUuid(assessmentUuid));

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { assessmentUuid } = await props.params;
  const assessment = await fetchAssessment(assessmentUuid);
  if (!assessment) {
    return { title: 'Assessment not found' };
  }
  return {
    title: assessment.title,
    description: assessment.description,
    openGraph: {
      title: assessment.title,
      description: assessment.description,
    },
    robots: { index: false },
  };
}

export default async function AssessmentAttemptPage(props: Props) {
  const { assessmentUuid } = await props.params;

  const [assessment, initialSession] = await Promise.all([fetchAssessment(assessmentUuid), getSession()]);

  if (!assessment) {
    notFound();
  }

  // If no session, redirect to login
  if (!initialSession) {
    redirect(`/auth/login?callbackUrl=/assessments/${assessmentUuid}`);
  }

  console.info('[ASSESSMENT_FLOW_ROUTE]', {
    routeMode: 'canonical',
    surface: 'attempt',
    assessmentUuid: assessment.assessment_uuid,
    activityUuid: assessment.activity_uuid,
    kind: assessment.kind,
  });

  const queryClient = new QueryClient();

  // Prefetch the activity-keyed assessment data that AssessmentLayout will need,
  // so the client doesn't duplicate this fetch after hydration.
  if (assessment.activity_uuid) {
    await queryClient.prefetchQuery(assessmentByActivityQueryOptions(assessment.activity_uuid));
  }

  return (
    <div className={jetBrainsMono.variable}>
      <SessionProvider initialSession={initialSession}>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <AssessmentAttemptClient
            activityUuid={assessment.activity_uuid}
            courseUuid={assessment.course_uuid ?? ''}
          />
        </HydrationBoundary>
      </SessionProvider>
    </div>
  );
}
