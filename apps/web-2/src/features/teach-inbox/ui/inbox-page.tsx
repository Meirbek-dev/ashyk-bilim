import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'

import { teachWorkOptions } from '../queries'
import { CourseFilter } from './course-filter'
import { EmptyInbox } from './empty-inbox'
import { inboxColumns } from './inbox-columns'
import { KindFilter } from './kind-filter'
import { RecentCourses } from './recent-courses'
import { SortMenu } from './sort-menu'

/** From this many works on, the course filter and the order are offered. */
const FILTERS_FROM = 10

/** /teach: one queue of what waits for the teacher, filters and order in the URL (server-side), rows into the review. */
export function InboxPage() {
  const search = useSearch({ from: '/_authed/teach/' })
  const navigate = useNavigate({ from: '/teach/' })
  const query = useSuspenseInfiniteQuery(teachWorkOptions(search))
  const items = query.data.pages.flatMap(page => page.items)
  const total = query.data.pages[0]?.total ?? 0
  const active = [search.kind, search.course].filter(Boolean).length
  // A short queue needs no course filter or order: two buttons over one row only made the page busier.
  const filters = total > FILTERS_FROM || active > 0
  return (
    <ListPage
      title={m.platform_nav_inbox()}
      count={total > 0 || active > 0 ? m.inbox_count({ count: total }) : undefined}
      // The kinds are the queue's sections: tabs on one rule with the course filter and the order (as the course
      // list's presets), not a row of buttons over a row of tabs; narrow, the buttons follow under the tabs.
      search={
        items.length > 0 || active > 0 ? (
          <div className="flex w-full flex-col gap-3 @4xl:flex-row @4xl:items-end @4xl:justify-between @4xl:gap-6 @4xl:border-b">
            <KindFilter search={search} counts={query.data.pages[0]?.kind_counts} />
            {filters ? (
              <div className="flex flex-wrap items-center gap-2 @4xl:mb-2 @4xl:flex-nowrap">
                <CourseFilter items={items} course={search.course} />
                <SortMenu sort={search.sort} />
              </div>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {items.length === 0 && active === 0 && !query.error ? (
        <EmptyInbox />
      ) : (
        <ListState
          pending={false}
          error={query.error}
          count={items.length}
          filtered={active > 0}
          emptyText={m.inbox_empty()}
          onResetFilters={() => void navigate({ search: {} })}
          onRetry={() => void query.refetch()}
        >
          <div className="[&_td:first-child]:ps-0 [&_td:last-child]:pe-0 [&_td:last-child]:text-right [&_th:first-child]:ps-0">
            <DataTable
              label={m.inbox_table()}
              rows={items}
              // No row with a due date: the empty «Срок» column goes.
              columns={
                items.some(item => item.due_at_unix !== null) ? inboxColumns : inboxColumns.filter(c => c.id !== 'due')
              }
              getKey={item => item.id}
            />
          </div>
        </ListState>
      )}
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
      {active === 0 ? (
        <div className="mt-8">
          <RecentCourses />
        </div>
      ) : null}
    </ListPage>
  )
}
