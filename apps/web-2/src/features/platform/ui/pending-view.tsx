import { ListSkeleton } from '#/shared/ui/list-skeleton'
import { Skeleton } from '#/shared/ui/skeleton'

/** A route still loading: the skeleton of a page (title, then rows). No spinner (DESIGN 7). */
export function PendingView() {
  return (
    <div className="flex flex-col gap-gutter">
      <Skeleton shape="title" />
      <ListSkeleton />
    </div>
  )
}
