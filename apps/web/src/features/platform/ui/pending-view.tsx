import { ListSkeleton } from '#/shared/components/list-skeleton'
import { Skeleton } from '#/shared/ui/skeleton'

/** A route still loading: the skeleton of a page (title, then rows). No spinner (DESIGN 7). */
export function PendingView() {
  return (
    <div className="flex flex-col gap-gutter">
      <Skeleton className="h-9 w-1/3" />
      <ListSkeleton />
    </div>
  )
}
