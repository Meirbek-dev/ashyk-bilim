import { getTeacherCourseList, normalizeAnalyticsQuery } from '@services/analytics/teacher'
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState'
import CourseHealthTable from '@components/Dashboard/Analytics/CourseHealthTable'
import TeacherFilterBar from '@components/Dashboard/Analytics/TeacherFilterBar'
import { Card, CardContent } from '@/components/ui/card'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { ChevronRight, LayoutDashboard } from 'lucide-react'

export default function PlatformAnalyticsCoursesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <PlatformAnalyticsCoursesPageInner searchParams={props.searchParams} />
}

async function PlatformAnalyticsCoursesPageInner(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = normalizeAnalyticsQuery(await props.searchParams)
  const t = await getTranslations('TeacherAnalytics')

  let courseList: Awaited<ReturnType<typeof getTeacherCourseList>>
  try {
    courseList = await getTeacherCourseList(query)
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.coursesUnavailableTitle')}
        description={error instanceof Error ? error.message : t('pages.coursesLoadError')}
      />
    )
  }

  const totalPages = Math.max(1, Math.ceil(courseList.total / courseList.page_size))
  const params = new URLSearchParams()
  if (query.window) params.set('window', query.window)
  if (query.compare) params.set('compare', query.compare)
  if (query.bucket) params.set('bucket', query.bucket)
  if (query.course_ids) params.set('course_ids', query.course_ids)
  if (query.cohort_ids) params.set('cohort_ids', query.cohort_ids)
  if (query.timezone) params.set('timezone', query.timezone)
  if (query.sort_by) params.set('sort_by', query.sort_by)
  if (query.sort_order) params.set('sort_order', query.sort_order)

  return (
    <div className="bg-background flex min-h-screen min-w-0 flex-1 flex-col">
      {/* Sticky Header block matching courses layout */}
      <header className="border-border bg-background sticky top-0 z-20 border-b shadow-sm">
        {/* Breadcrumb / Title row */}
        <div className="flex h-16 items-center gap-4 px-4 lg:px-8">
          <Link
            href="/dash/analytics"
            className="text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground flex shrink-0 items-center gap-2 text-sm transition-colors"
          >
            <LayoutDashboard className="size-4 shrink-0" />
            <span className="hidden sm:inline">{t('overview.label')}</span>
          </Link>

          <ChevronRight className="text-muted-foreground/50 size-4 shrink-0" />

          <h1 className="text-foreground dark:text-foreground min-w-0 flex-1 truncate text-base font-semibold">
            {t('pages.courseRankingTitle')}
          </h1>
        </div>
      </header>

      <main className="min-w-0 flex-1 space-y-6 px-4 py-8 lg:px-8">
        <Card className="bg-card text-card-foreground border-border rounded-xl shadow-xs">
          <CardContent className="pt-6">
            <TeacherFilterBar
              path="/dash/analytics/courses"
              query={query}
              courseCount={courseList.total}
              courseOptions={courseList.course_options ?? []}
              cohortOptions={courseList.cohort_options ?? []}
            />
          </CardContent>
        </Card>
        <div className="text-muted-foreground flex items-center justify-between px-1 text-sm">
          <span>
            {t('table.showingRows', {
              from: (courseList.page - 1) * courseList.page_size + 1,
              to: Math.min(courseList.page * courseList.page_size, courseList.total),
              total: courseList.total,
            })}
          </span>
        </div>
        <div className="bg-card border-border overflow-hidden rounded-xl shadow-xs">
          <CourseHealthTable rows={courseList.items} storageKey="courses-page" serverPaginated />
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={courseList.page <= 1}
              nativeButton={false}
              render={
                <Link
                  href={`/dash/analytics/courses?${new URLSearchParams({ ...Object.fromEntries(params.entries()), page: String(Math.max(1, courseList.page - 1)), page_size: String(courseList.page_size) }).toString()}`}
                />
              }
            >
              {t('table.prev')}
            </Button>
            <span className="text-muted-foreground text-sm font-medium">
              {t('table.page', { current: courseList.page, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={courseList.page >= totalPages}
              nativeButton={false}
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
      </main>
    </div>
  )
}
