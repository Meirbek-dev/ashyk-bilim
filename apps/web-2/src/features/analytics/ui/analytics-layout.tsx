import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, useLocation, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { DetailPage } from '#/shared/components/templates/detail-page'

import { pickFilters, tabCounts, tabOf, tabPaths, TABS } from '../model/filters'
import { overviewOptions } from '../queries'
import { FilterBar } from './filter-bar'
import { tabLabels } from './labels'
import { SaveViewDialog } from './save-view-dialog'
import { SavedViews } from './saved-views'

/**
 * /teach/analytics: one filter set over four tab routes (spec 5.3). A tab link carries the filters and leaves the
 * other tab's page, sort and drill-down behind; overview and learners show their counts (B-ANL-33).
 */
export function AnalyticsLayout() {
  const filters = pickFilters(useSearch({ from: '/_authed/teach/analytics' }))
  const tab = tabOf(useLocation().pathname)
  const { data: overview } = useSuspenseQuery(overviewOptions(filters))
  const counts = tabCounts(overview)
  return (
    <DetailPage
      title={m.platform_nav_analytics()}
      primaryAction={<SaveViewDialog tab={tab} filters={filters} />}
      tabs={TABS.map(name => (
        <Link key={name} variant="tab" to={tabPaths[name]} search={filters}>
          {tabLabels[name]()}
          {counts[name] ? <span className="ms-2 text-muted-foreground tabular-nums">{counts[name]}</span> : null}
        </Link>
      ))}
    >
      <div className="flex flex-col gap-4">
        <FilterBar filters={filters} />
        <SavedViews />
      </div>
      <Outlet />
    </DetailPage>
  )
}
