import { getAdminAnalyticsOverview, getTeacherOverview, normalizeAnalyticsQuery } from '@services/analytics/teacher';
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState';
import TeacherOverview from '@components/Dashboard/Analytics/TeacherOverview';
import { getTranslations } from 'next-intl/server';

export default function PlatformAnalyticsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PlatformAnalyticsPageInner searchParams={props.searchParams} />;
}

async function PlatformAnalyticsPageInner(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = normalizeAnalyticsQuery(await props.searchParams);
  const t = await getTranslations('TeacherAnalytics');

  try {
    const [overview, adminData] = await Promise.all([
      getTeacherOverview(query),
      getAdminAnalyticsOverview(query).catch(() => null),
    ]);

    return (
      <TeacherOverview
        query={query}
        data={overview}
        adminData={adminData}
      />
    );
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.overviewDisabledTitle')}
        description={error instanceof Error ? error.message : t('pages.overviewLoadError')}
      />
    );
  }
}
