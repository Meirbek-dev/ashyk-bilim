import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'

import { Alert } from './alert'
import { Button } from './button'
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
  if (status === 'forbidden') return <p className="text-muted-foreground">{m.ui_forbidden()}</p>
  if (status === 'error')
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert>{presentError(input.error)}</Alert>
        <Button variant="outline" onClick={onRetry}>
          {m.ui_retry()}
        </Button>
      </div>
    )
  const noMatches = status === 'no-matches'
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <p className="text-muted-foreground">{noMatches ? m.ui_no_matches() : emptyText}</p>
      {noMatches && onResetFilters ? (
        <Button variant="outline" onClick={onResetFilters}>
          {m.ui_reset_filters()}
        </Button>
      ) : null}
      {noMatches ? null : emptyAction}
    </div>
  )
}
