import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import DashShell from './dash-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('DashPage');

  return {
    title: t('DashboardTitle'),
  };
}

export default async function PlatformDashLayout({ children }: { children: React.ReactNode }) {
  // Dash auth is enforced in proxy.ts so redirects happen before any dashboard shell renders.
  // Gamification remains scoped to the learner-facing shell to avoid eager admin-side fetches.
  return <DashShell>{children}</DashShell>;
}
