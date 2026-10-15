import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

import { WINDOWS } from '../model/filters'
import { adminAnalyticsOptions } from '../queries'
import type { AdminAnalyticsSearch } from '../route'
import { FilterMenu } from './filter-menu'
import { windowLabels } from './labels'

const ALL = 'all'

const nameOf = (options: { value: string; label: string }[], id: string | undefined) =>
  options.find(option => option.value === id)?.label ?? m.analytics_admin_all()

/**
 * The admin rankings' period (B-ANL-31) and one course or group (B-ANL-34), each in the URL. The courses and groups
 * offered are the ones the unscoped rankings of the period name.
 */
export function AdminFilters({ search }: { search: AdminAnalyticsSearch }) {
  const navigate = useNavigate()
  const { data: all } = useSuspenseQuery(adminAnalyticsOptions(search.window))
  const go = (patch: Partial<AdminAnalyticsSearch>) =>
    void navigate({ to: '/admin/analytics', search: { ...search, ...patch } })
  const courses = all.course_health_ranking.map(row => ({ value: row.course_id, label: row.course_name }))
  const groups = all.cohort_retention.map(row => ({ value: row.cohort_id, label: row.cohort_name }))
  return (
    <div className="flex flex-wrap gap-2">
      <FilterMenu
        choice={{
          label: m.analytics_admin_window({ window: windowLabels[search.window]() }),
          value: search.window,
          options: WINDOWS.map(value => ({ value, label: windowLabels[value]() })),
          onValueChange: value => {
            const window = WINDOWS.find(known => known === value)
            if (window) go({ window })
          },
        }}
      />
      <FilterMenu
        choice={{
          label: m.analytics_admin_course({ course: nameOf(courses, search.course) }),
          value: search.course ?? ALL,
          options: [{ value: ALL, label: m.analytics_admin_all() }, ...courses],
          onValueChange: value => go({ course: value === ALL ? undefined : value }),
        }}
      />
      <FilterMenu
        choice={{
          label: m.analytics_admin_group({ group: nameOf(groups, search.cohort) }),
          value: search.cohort ?? ALL,
          options: [{ value: ALL, label: m.analytics_admin_all() }, ...groups],
          onValueChange: value => go({ cohort: value === ALL ? undefined : value }),
        }}
      />
    </div>
  )
}
