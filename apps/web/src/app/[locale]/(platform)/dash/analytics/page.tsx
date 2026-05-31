import { redirect } from '@/i18n/navigation'
import { normalizeAnalyticsQuery } from '@services/analytics/teacher'

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PlatformAnalyticsPage(props: PageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([props.params, props.searchParams])
  const query = normalizeAnalyticsQuery(resolvedSearchParams)

  const params = new URLSearchParams()
  if (query.window) params.set('window', query.window)
  if (query.compare) params.set('compare', query.compare)
  if (query.bucket) params.set('bucket', query.bucket)
  if (query.course_ids) params.set('course_ids', query.course_ids)
  if (query.cohort_ids) params.set('cohort_ids', query.cohort_ids)
  if (query.teacher_user_id) params.set('teacher_user_id', String(query.teacher_user_id))
  if (query.timezone) params.set('timezone', query.timezone)
  if (query.sort_by) params.set('sort_by', query.sort_by)
  if (query.sort_order) params.set('sort_order', query.sort_order)
  if (query.bucket_start) params.set('bucket_start', query.bucket_start)

  const serialized = params.toString()
  redirect({
    href: `/dash/analytics/overview${serialized ? `?${serialized}` : ''}`,
    locale: resolvedParams.locale,
  })
}
