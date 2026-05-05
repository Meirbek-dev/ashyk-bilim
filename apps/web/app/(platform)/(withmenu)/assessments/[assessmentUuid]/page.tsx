import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { Metadata } from 'next';

import { getSession } from '@/lib/auth/session';
import { SessionProvider } from '@/components/providers/session-provider';
import { jetBrainsMono } from '@/lib/fonts';
import { getAssessmentByUuid } from '@services/assessments/assessments';
import AssessmentAttemptClient from './AssessmentAttemptClient';

interface Props {
  params: Promise<{ assessmentUuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  await connection();
  const { assessmentUuid } = await props.params;
  const assessment = await getAssessmentByUuid(assessmentUuid);
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
  await connection();
  const { assessmentUuid } = await props.params;

  const [assessment, initialSession] = await Promise.all([getAssessmentByUuid(assessmentUuid), getSession()]);

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

  return (
    <div className={jetBrainsMono.variable}>
      <SessionProvider initialSession={initialSession}>
        <AssessmentAttemptClient
          activityUuid={assessment.activity_uuid}
          courseUuid={assessment.course_uuid ?? ''}
        />
      </SessionProvider>
    </div>
  );
}
