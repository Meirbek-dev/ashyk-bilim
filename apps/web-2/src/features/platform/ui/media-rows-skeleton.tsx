import { Skeleton } from '#/shared/ui/skeleton'

/**
 * The loading shape of a list whose items are small volumes in rows on a phone and books from @xl («Мои курсы»): the
 * same breakpoints as the items, so nothing jumps from books to rows when the page arrives.
 */
export function MediaRowsSkeleton() {
  return (
    <div className="@container flex flex-col gap-gutter">
      <Skeleton className="h-9 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-x-6 gap-y-8 @xl:grid-cols-2 @xl:gap-y-10 @4xl:grid-cols-3">
        {[0, 1, 2, 3].map(book => (
          <div key={book} className="flex gap-4 @xl:flex-col @xl:gap-3">
            <Skeleton className="aspect-video w-28 shrink-0 rounded-md @xl:w-full @xl:rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
