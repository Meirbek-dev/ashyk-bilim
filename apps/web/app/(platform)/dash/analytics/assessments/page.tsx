import { getTeacherAssessmentList, normalizeAnalyticsQuery } from '@services/analytics/teacher';
import AssessmentOutliersTable from '@components/Dashboard/Analytics/AssessmentOutliersTable';
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState';
import TeacherFilterBar from '@components/Dashboard/Analytics/TeacherFilterBar';
import { Card, CardContent } from '@/components/ui/card';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PlatformAnalyticsAssessmentsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PlatformAnalyticsAssessmentsPageInner searchParams={props.searchParams} />;
}

async function PlatformAnalyticsAssessmentsPageInner(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = normalizeAnalyticsQuery(await props.searchParams);
  const t = await getTranslations('TeacherAnalytics');

  try {
    const assessments = await getTeacherAssessmentList(query);
    const totalPages = Math.max(1, Math.ceil(assessments.total / assessments.page_size));
    const params = new URLSearchParams();
    if (query.window) params.set('window', query.window);
    if (query.compare) params.set('compare', query.compare);
    if (query.bucket) params.set('bucket', query.bucket);
    if (query.course_ids) params.set('course_ids', query.course_ids);
    if (query.cohort_ids) params.set('cohort_ids', query.cohort_ids);
    if (query.timezone) params.set('timezone', query.timezone);
    if (query.sort_by) params.set('sort_by', query.sort_by);
    if (query.sort_order) params.set('sort_order', query.sort_order);
    if (query.bucket_start) params.set('bucket_start', query.bucket_start);

    return (
      <main
        role="main"
        className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 xl:px-8"
      >
        <Card className="bg-card text-card-foreground border-slate-200 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <CardContent className="space-y-4">
            <TeacherFilterBar
              path="/dash/analytics/assessments"
              query={query}
              courseCount={assessments.course_options.length}
              courseOptions={assessments.course_options}
              cohortOptions={assessments.cohort_options}
            />
            <div
              className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300"
              aria-live="polite"
              aria-atomic="true"
            >
              <span>
                {t('table.showingRows', {
                  from: (assessments.page - 1) * assessments.page_size + 1,
                  to: Math.min(assessments.page * assessments.page_size, assessments.total),
                  total: assessments.total,
                })}
              </span>
            </div>
            <AssessmentOutliersTable
              rows={assessments.items}
              storageKey="assessments-page"
              serverPaginated
            />
            {totalPages > 1 ? (
              <nav
                aria-label={t('table.pagination')}
                className="flex items-center justify-end gap-2"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={assessments.page <= 1}
                  aria-label={t('table.prev')}
                  nativeButton={false}
                  render={
                    <Link
                      href={`/dash/analytics/assessments?${new URLSearchParams({ ...Object.fromEntries(params.entries()), page: String(Math.max(1, assessments.page - 1)), page_size: String(assessments.page_size) }).toString()}`}
                    />
                  }
                >
                  {t('table.prev')}
                </Button>
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {t('table.page', { current: assessments.page, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={assessments.page >= totalPages}
                  aria-label={t('table.next')}
                  nativeButton={false}
                  render={
                    <Link
                      href={`/dash/analytics/assessments?${new URLSearchParams({ ...Object.fromEntries(params.entries()), page: String(Math.min(totalPages, assessments.page + 1)), page_size: String(assessments.page_size) }).toString()}`}
                    />
                  }
                >
                  {t('table.next')}
                </Button>
              </nav>
            ) : null}
          </CardContent>
        </Card>
      </main>
    );
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.assessmentsUnavailableTitle')}
        description={error instanceof Error ? error.message : t('pages.assessmentsLoadError')}
      />
    );
  }
}
