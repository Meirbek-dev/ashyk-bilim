import { getTeacherCourseList, normalizeAnalyticsQuery } from '@services/analytics/teacher';
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState';
import CourseHealthTable from '@components/Dashboard/Analytics/CourseHealthTable';
import TeacherFilterBar from '@components/Dashboard/Analytics/TeacherFilterBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PlatformAnalyticsCoursesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PlatformAnalyticsCoursesPageInner searchParams={props.searchParams} />;
}

async function PlatformAnalyticsCoursesPageInner(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = normalizeAnalyticsQuery(await props.searchParams);
  const t = await getTranslations('TeacherAnalytics');

  try {
    const courseList = await getTeacherCourseList(query);
    const totalPages = Math.max(1, Math.ceil(courseList.total / courseList.page_size));
    const params = new URLSearchParams();
    if (query.window) params.set('window', query.window);
    if (query.compare) params.set('compare', query.compare);
    if (query.bucket) params.set('bucket', query.bucket);
    if (query.course_ids) params.set('course_ids', query.course_ids);
    if (query.cohort_ids) params.set('cohort_ids', query.cohort_ids);
    if (query.timezone) params.set('timezone', query.timezone);
    if (query.sort_by) params.set('sort_by', query.sort_by);
    if (query.sort_order) params.set('sort_order', query.sort_order);

    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 xl:px-8">
        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>{t('pages.courseRankingTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">{t('pages.courseRankingDescription')}</CardContent>
        </Card>
        <Card className="bg-background border-slate-200 shadow-sm">
          <CardContent>
            <TeacherFilterBar
              path="/dash/analytics/courses"
              query={query}
              courseCount={courseList.total}
              courseOptions={courseList.course_options}
              cohortOptions={courseList.cohort_options}
            />
          </CardContent>
        </Card>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {t('table.showingRows', {
              from: (courseList.page - 1) * courseList.page_size + 1,
              to: Math.min(courseList.page * courseList.page_size, courseList.total),
              total: courseList.total,
            })}
          </span>
        </div>
        <CourseHealthTable
          rows={courseList.items}
          storageKey="courses-page"
          serverPaginated
        />
        {totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={courseList.page <= 1}
              render={
                <Link
                  href={`/dash/analytics/courses?${new URLSearchParams({ ...Object.fromEntries(params.entries()), page: String(Math.max(1, courseList.page - 1)), page_size: String(courseList.page_size) }).toString()}`}
                />
              }
            >
              {t('table.prev')}
            </Button>
            <span className="text-sm text-slate-600">
              {t('table.page', { current: courseList.page, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={courseList.page >= totalPages}
              render={
                <Link
                  href={`/dash/analytics/courses?${new URLSearchParams({ ...Object.fromEntries(params.entries()), page: String(Math.min(totalPages, courseList.page + 1)), page_size: String(courseList.page_size) }).toString()}`}
                />
              }
            >
              {t('table.next')}
            </Button>
          </div>
        ) : null}
      </div>
    );
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.coursesUnavailableTitle')}
        description={error instanceof Error ? error.message : t('pages.coursesLoadError')}
      />
    );
  }
}
