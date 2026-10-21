import { ListSkeleton } from '#/shared/components/list-skeleton'
import { Skeleton } from '#/shared/ui/skeleton'

type Shape = 'grid' | 'detail' | 'tiles' | undefined

/** The deepest `staticData.skeleton` at or under the match `from` (its id); the same on the server and the client. */
export function skeletonShape(
  matches: readonly { id: string; staticData: { skeleton?: Shape } }[],
  from: string | undefined,
): Shape {
  const start = Math.max(
    0,
    matches.findIndex(match => match.id === from),
  )
  return matches.slice(start).findLast(match => match.staticData.skeleton)?.staticData.skeleton
}

/** A shell page's loading shape (PendingView): rows, a card grid, an object page with tabs, or tiles over rows. */
export function PageSkeleton({ shape }: { shape: Shape }) {
  if (shape === 'grid')
    return (
      <div className="@container flex flex-col gap-gutter">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-8 w-2/3" />
        <div className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
          {[0, 1, 2].map(card => (
            <div key={card} className="flex flex-col gap-3">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  if (shape === 'detail')
    return (
      <div className="@container flex flex-col gap-gutter">
        <div className="flex items-center gap-4">
          <Skeleton className="hidden aspect-video w-32 shrink-0 rounded-xl @xl:block" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
        <Skeleton className="h-9 w-full" />
        <ListSkeleton />
      </div>
    )
  if (shape === 'tiles')
    return (
      <div className="@container flex flex-col gap-gutter">
        <Skeleton className="h-9 w-1/3" />
        <div className="grid gap-4 @xl:grid-cols-3">
          {[0, 1, 2].map(tile => (
            <Skeleton key={tile} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <ListSkeleton />
      </div>
    )
  return (
    <div className="flex flex-col gap-gutter">
      <Skeleton className="h-9 w-1/3" />
      <ListSkeleton />
    </div>
  )
}
