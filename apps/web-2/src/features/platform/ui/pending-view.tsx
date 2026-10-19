import { useMatches } from '@tanstack/react-router'

import { ListSkeleton } from '#/shared/components/list-skeleton'
import { Skeleton } from '#/shared/ui/skeleton'

/**
 * A route still loading: the skeleton of a page (title, then rows). No spinner (DESIGN 7). A focus-layout route
 * (player, attempt, editor) has no shell around it: its skeleton draws the focus bar and the reading column, not bars
 * flush against the window's edge.
 */
export function PendingView() {
  const focus = useMatches({ select: matches => matches.some(match => match.staticData.layout === 'focus') })
  if (focus)
    return (
      <div className="flex min-h-dvh flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4 @3xl:px-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-6 w-1/3" />
        </div>
        <div className="mx-auto flex w-full max-w-prose flex-col gap-gutter px-4 py-gutter">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-2/3" />
          <ListSkeleton />
        </div>
      </div>
    )
  return (
    <div className="flex flex-col gap-gutter">
      <Skeleton className="h-9 w-1/3" />
      <ListSkeleton />
    </div>
  )
}
