import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { formatDate } from '#/shared/i18n/format'
import { Skeleton } from '#/shared/ui/skeleton'

import { updatesOptions } from '../queries'

/** The `updates` tab: the course's announcements as the server orders them; written in the course workspace. */
export function UpdatesPage() {
  const { courseId } = useParams({ from: '/_public/courses/$courseId/updates' })
  const query = useSuspenseInfiniteQuery(updatesOptions(courseId))
  return (
    <ListState
      pending={false}
      error={query.error}
      count={query.data.length}
      filtered={false}
      emptyText={m.course_updates_empty()}
      onRetry={() => void query.refetch()}
    >
      <DataList items={query.data} getKey={update => update.id}>
        {update => (
          <article className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold wrap-anywhere">{update.title}</h2>
            <p className="text-sm text-muted-foreground">{formatDate(update.created_at_unix)}</p>
            <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
              <MarkdownView content={update.content} />
            </Suspense>
          </article>
        )}
      </DataList>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
