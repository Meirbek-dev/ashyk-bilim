import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { m } from '#/paraglide/messages'
import type { ReportStatus } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { reportsOptions } from '../queries'
import { ReportRow } from './report-row'

export function ReportsList({ status }: { status: ReportStatus }) {
  const query = useSuspenseInfiniteQuery(reportsOptions(status))
  const items = query.data.pages.flatMap(page => page.items)
  return (
    <ListState
      pending={false}
      error={query.error}
      count={items.length}
      filtered={false}
      emptyText={status === 'open' ? m.conversations_reports_empty_open() : m.conversations_reports_empty_resolved()}
      onRetry={() => void query.refetch()}
    >
      <div className="-mt-3 [&>ul]:border-t-0">
        <DataList variant="rows" items={items} getKey={item => item.id}>
          {item => <ReportRow report={item} />}
        </DataList>
      </div>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
