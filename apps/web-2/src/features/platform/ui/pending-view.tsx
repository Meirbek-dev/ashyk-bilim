import { useMatch, useMatches } from '@tanstack/react-router'

import { ListSkeleton } from '#/shared/components/list-skeleton'
import { Skeleton } from '#/shared/ui/skeleton'

import { PageSkeleton, skeletonShape } from './page-skeleton'

/**
 * A route still loading: the skeleton of the page it becomes (DESIGN 7; no spinner). The first paint of a signed-in
 * page (SSR is data-only) is this, so it has the page's shape, not bars swapped for cards: rows by default, else the
 * deepest `staticData.skeleton` at or under the pending route (a tab loading under its workspace is rows, not a
 * second workspace header). A focus-layout route (player, attempt, editor) has no shell around it: its skeleton draws the
 * focus bar and the reading column, not bars flush against the window's edge.
 */
export function PendingView() {
  const focus = useMatches({ select: matches => matches.some(match => match.staticData.layout === 'focus') })
  // The shape comes from the route tree only, never from load status (which differs between the server and the
  // hydrating client: a mismatch React re-renders): the deepest route that names one, at or under the route whose
  // pending view this is. The data-only SSR paint renders it at the layout, so the page's shape wins; a tab loading
  // under its rendered workspace renders it at the tab: rows, not a second workspace header.
  const here = useMatch({ strict: false, select: match => match.id })
  const shape = useMatches({ select: matches => skeletonShape(matches, here) })
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
