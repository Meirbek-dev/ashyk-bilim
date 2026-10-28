import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { ErrorAlert } from './error-alert'
import { ListSkeleton } from './list-skeleton'
import { listStatus, type ListStatusInput } from './list-status'

type ListStateProps = ListStatusInput & {
  /** One sentence on what will appear here. */
  emptyText: string
  /** The create action, only when the user may create. */
  emptyAction?: ReactNode
  /** Navigates to the same URL without filters; required when `filtered` can be true. */
  onResetFilters?: () => void
  onRetry: () => void
  /** The list itself, rendered only when there is data. */
  children: ReactNode
}

/** Every data region renders exactly one of: loading, empty, no matches, error / no access (DESIGN 7). */
export function ListState({ emptyText, emptyAction, onResetFilters, onRetry, children, ...input }: ListStateProps) {
  const status = listStatus(input)
  if (status === 'ready') return children
  if (status === 'loading') return <ListSkeleton />
  // The sentences are UI text (DESIGN 4: `text-sm`), the size of the section hints and buttons around them.
  if (status === 'forbidden') return <p className="text-sm text-muted-foreground">{m.ui_forbidden()}</p>
  if (status === 'error')
    return (
      <div className="flex flex-col items-start gap-4">
        <ErrorAlert>{presentError(input.error)}</ErrorAlert>
        <Button variant="outline" onClick={onRetry}>
          {m.ui_retry()}
        </Button>
      </div>
    )
  const noMatches = status === 'no-matches'
  return (
    <div className="flex flex-col items-start gap-4 py-2">
      {/* The text may quote what was typed (a search): a long unbroken query wraps instead of widening the page. */}
      <p className="max-w-full text-sm wrap-anywhere text-muted-foreground">
        {noMatches ? m.ui_no_matches() : emptyText}
      </p>
      {noMatches && onResetFilters ? (
        <Button variant="outline" onClick={onResetFilters}>
          {m.ui_reset_filters()}
        </Button>
      ) : null}
      {noMatches ? null : emptyAction}
    </div>
  )
}
