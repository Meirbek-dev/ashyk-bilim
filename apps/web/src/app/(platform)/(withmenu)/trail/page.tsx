import { getServerGamificationDashboard, getServerLeaderboard } from '@/services/gamification/server';
import { GamificationProvider } from '@/components/Contexts/GamificationContext';
import { getSession } from '@/lib/auth/session';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import type { Metadata } from 'next';

import Trail from '@/app/_shared/withmenu/trail/trail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('TrailPage');

  return {
    title: `${t('title')} - Ashyk Bilim`,
    description: t('metaDescription'),
  };
}

export default async function PlatformTrailPage() {
  await connection();

  const content = (
    <div>
      <Trail />
    </div>
  );

  const session = await getSession();
  if (!session) {
    return content;
  }

  const [dashboardData, leaderboardData] = await Promise.all([
    getServerGamificationDashboard(),
    getServerLeaderboard(10),
  ]);

  if (!dashboardData) {
    return content;
  }

  return (
    <GamificationProvider
      initialData={{
        profile: dashboardData.profile,
        dashboard: dashboardData,
        leaderboard: leaderboardData ?? null,
      }}
    >
      {content}
    </GamificationProvider>
  );
}
