import { useMatches } from '@tanstack/react-router'

import { ListSkeleton } from '#/shared/components/list-skeleton'
import { Skeleton } from '#/shared/ui/skeleton'

import { PageSkeleton } from './page-skeleton'

/**
 * A route still loading: the skeleton of the page it becomes (DESIGN 7; no spinner). The first paint of a signed-in
 * page (SSR is data-only) is this, so it has the page's shape, not bars swapped for cards: rows by default, else the
 * first pending route's `staticData.skeleton` (a tab loading under its workspace is rows, not a second workspace
 * header). A focus-layout route (player, attempt, editor) has no shell around it: its skeleton draws the
 * focus bar and the reading column, not bars flush against the window's edge.
 */
export function PendingView() {
  const focus = useMatches({ select: matches => matches.some(match => match.staticData.layout === 'focus') })
  // The first route still loading decides; with none (the data-only SSR paint: data in, components not yet), the
  // deepest route that names a shape.
  const shape = useMatches({
    select: matches =>
      (matches.find(match => match.status === 'pending') ?? matches.findLast(match => match.staticData.skeleton))
        ?.staticData.skeleton,
  })
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
  return <PageSkeleton shape={shape} />
}
