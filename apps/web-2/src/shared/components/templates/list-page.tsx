import { Ellipsis, ListFilter } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import { IconButton } from '../icon-button'
import { SheetPanel } from '../sheet-panel'

type ListPageProps = {
  title: string
  /** "12 courses": the caller formats the plural. */
  count?: string
  /** The view's one primary button (or a primary Link); stays visible at every width. */
  primaryAction?: ReactNode
  /** Outline buttons at full width, one "more" menu when narrow. */
  secondaryActions?: readonly { label: string; onSelect: () => void }[]
  /** The search input: always visible. Its value lives in the URL. */
  search?: ReactNode
  /** Filter controls (values in the URL): inline when wide, in a "Filters (n)" sheet when narrow. */
  filters?: ReactNode
  activeFilters?: number
  /** ListState around a DataTable / DataList, then ShowMore. */
  children: ReactNode
}

/** A list screen (DESIGN 6): h1 + count + actions, the filter row, the list. */
export function ListPage(props: ListPageProps) {
  const { title, count, primaryAction, secondaryActions = [], search, filters, activeFilters = 0, children } = props
  return (
    <section className="@container flex flex-col gap-gutter">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {count ? <p className="text-sm text-muted-foreground tabular-nums">{count}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden gap-2 @2xl:flex">
            {secondaryActions.map(action => (
              <Button key={action.label} variant="outline" onClick={action.onSelect}>
                {action.label}
              </Button>
            ))}
          </div>
          {secondaryActions.length > 0 ? (
            <div className="@2xl:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<IconButton label={m.ui_more_actions()} icon={<Ellipsis aria-hidden />} />}
                />
                <DropdownMenuContent align="end">
                  {secondaryActions.map(action => (
                    <DropdownMenuItem key={action.label} onClick={action.onSelect}>
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {primaryAction}
        </div>
      </header>
      {search || filters ? (
        <div className="flex flex-wrap items-end gap-2">
          {search}
          {filters ? (
            <>
              <div className="hidden flex-wrap items-end gap-2 @2xl:flex">{filters}</div>
              <div className="@2xl:hidden">
                <SheetPanel
                  side="right"
                  title={m.ui_filters()}
                  trigger={
                    <Button variant="outline">
                      <ListFilter aria-hidden />
                      {activeFilters > 0 ? m.ui_filters_count({ count: activeFilters }) : m.ui_filters()}
                    </Button>
                  }
                >
                  {filters}
                </SheetPanel>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
