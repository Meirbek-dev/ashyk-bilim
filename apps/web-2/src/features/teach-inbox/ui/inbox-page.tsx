import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { ListPage } from '#/shared/components/templates/list-page'

import { filterItems } from '../model/inbox'
import { teachWorkOptions } from '../queries'
import { CourseFilter } from './course-filter'
import { inboxColumns } from './inbox-columns'
import { KindFilter } from './kind-filter'

/** /teach: one queue of what waits for the teacher, filters in the URL, each row straight into the review. */
export function InboxPage() {
  const search = useSearch({ from: '/_authed/teach/' })
  const navigate = useNavigate({ from: '/teach/' })
  const query = useSuspenseInfiniteQuery(teachWorkOptions())
  const items = query.data.pages.flatMap(page => page.items)
  const shown = filterItems(items, search)
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
          </>
        ) : null
      }
      activeFilters={active}
    >
      <ListState
        pending={false}
        error={query.error}
        count={shown.length}
        filtered={active > 0}
        emptyText={m.inbox_empty()}
        onResetFilters={() => void navigate({ search: {} })}
        onRetry={() => void query.refetch()}
      >
        <DataTable label={m.inbox_table()} rows={shown} columns={inboxColumns} getKey={item => item.id} />
      </ListState>
      {/* Outside ListState: the filters narrow loaded pages only, so the next page may still hold matches. */}
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListPage>
  )
}
