import { Outlet, useLocation, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'
import { DetailPage } from '#/shared/ui/templates/detail-page'

import { pickFilters, tabOf, tabPaths, TABS } from '../model/filters'
import { FilterBar } from './filter-bar'
import { tabLabels } from './labels'
import { SaveViewDialog } from './save-view-dialog'
import { SavedViews } from './saved-views'

/**
 * /teach/analytics: one filter set over four tab routes (spec 5.3). A tab link carries the filters and leaves the
 * other tab's page, sort and drill-down behind.
 */
export function AnalyticsLayout() {
  const filters = pickFilters(useSearch({ from: '/_authed/teach/analytics' }))
  const tab = tabOf(useLocation().pathname)
  return (
    <DetailPage
      title={m.platform_nav_analytics()}
      primaryAction={<SaveViewDialog tab={tab} filters={filters} />}
      tabs={TABS.map(name => (
        <Link key={name} variant="tab" to={tabPaths[name]} search={filters}>
          {tabLabels[name]()}
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
