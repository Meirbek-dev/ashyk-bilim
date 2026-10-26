import { Skeleton } from '#/shared/ui/skeleton'

/**
 * The loading shape of a list whose items are thumbnail rows on a phone and cover cards from @xl («Мои курсы»): the
 * same breakpoints as the items, so nothing jumps from big cards to rows when the page arrives.
 */
export function MediaRowsSkeleton() {
  return (
    <div className="@container flex flex-col gap-gutter">
      <Skeleton className="h-9 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
        {[0, 1, 2].map(card => (
          <div key={card} className="flex overflow-hidden rounded-xl border @xl:flex-col">
            <Skeleton className="m-3 aspect-video w-24 shrink-0 rounded-md @xl:m-0 @xl:w-full @xl:rounded-none" />
            <div className="flex flex-1 flex-col gap-2 py-3 pr-3 @xl:p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
