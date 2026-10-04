import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'

import { teachWorkOptions } from '../queries'
import { CourseFilter } from './course-filter'
import { inboxColumns } from './inbox-columns'
import { KindFilter } from './kind-filter'
import { SortMenu } from './sort-menu'

/** /teach: one queue of what waits for the teacher, filters and order in the URL (server-side), rows into the review. */
export function InboxPage() {
  const search = useSearch({ from: '/_authed/teach/' })
  const navigate = useNavigate({ from: '/teach/' })
  const query = useSuspenseInfiniteQuery(teachWorkOptions(search))
  const items = query.data.pages.flatMap(page => page.items)
  const total = query.data.pages[0]?.total ?? 0
  const active = [search.kind, search.course].filter(Boolean).length
  return (
    <ListPage
      title={m.platform_nav_inbox()}
      count={m.inbox_count({ count: total })}
      filters={
        items.length > 0 || active > 0 ? (
          <>
            <KindFilter search={search} />
            <CourseFilter items={items} course={search.course} />
            <SortMenu sort={search.sort} />
          </>
        ) : null
      }
      activeFilters={active}
    >
      <ListState
        pending={false}
        error={query.error}
        count={items.length}
        filtered={active > 0}
        emptyText={m.inbox_empty()}
        onResetFilters={() => void navigate({ search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable label={m.inbox_table()} rows={items} columns={inboxColumns} getKey={item => item.id} />
      </ListState>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListPage>
  )
}
