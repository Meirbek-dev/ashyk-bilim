import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import CodeChallengeConfigEditor from '@components/features/courses/code-challenges/CodeChallengeConfigEditor';
import { getSession } from '@/lib/auth/session';

import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

interface MetadataProps {
  params: Promise<{ courseuuid: string; activityid: string }>;
}

export async function generateMetadata(_props: MetadataProps): Promise<Metadata> {
  const t = await getTranslations('Activities.CodeChallenges');

  return {
    title: `${t('configureChallenge')} - Ashyq Bilim`,
    description: t('configureDescription'),
  };
}

interface PageProps {
  params: Promise<{
    courseuuid: string;
    activityid: string;
  }>;
}

export default async function PlatformCodeChallengeEditorPage({ params }: PageProps) {
  await connection();
  const session = await getSession();
  const { courseuuid, activityid } = await params;

  if (!session) {
    redirect('/auth/signin');
  }

  return (
    <div className="container mx-auto py-8">
      <CodeChallengeConfigEditor
        activityUuid={activityid}
        courseId={courseuuid}
      />
    </div>
  );
}
