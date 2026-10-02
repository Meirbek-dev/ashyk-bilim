import { m } from '#/paraglide/messages'

import { Skeleton } from './skeleton'

/** Loading rows of a list region; the label is for screen readers only. */
export function ListSkeleton() {
  return (
    <output aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">{m.ui_loading()}</span>
      <Skeleton shape="row" />
      <Skeleton shape="row" />
      <Skeleton shape="row" />
    </output>
  )
}
