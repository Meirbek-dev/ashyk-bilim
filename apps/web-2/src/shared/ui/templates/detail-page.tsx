import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'

type DetailPageProps = {
  title: string
  /** One line under the title: author, dates, counts. */
  meta?: ReactNode
  /** A Badge from the feature's status table. */
  status?: ReactNode
  /** The one primary button or Link; full width under the title when narrow. */
  primaryAction?: ReactNode
  /** Kit `<Link variant="tab">` items, one per child route (DESIGN 8: tabs are routes). */
  tabs?: ReactNode
  /** The `<Outlet />` of the tab routes. */
  children: ReactNode
}

/** An object's page (DESIGN 6): title, meta, status, primary action, tab links, then the tab's route. */
export function DetailPage({ title, meta, status, primaryAction, tabs, children }: DetailPageProps) {
  return (
    <section className="@container flex flex-col gap-gutter">
      <header className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {status}
          </div>
          {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
        </div>
        {primaryAction ? <div className="flex flex-col @2xl:block">{primaryAction}</div> : null}
      </header>
      {tabs ? (
        <nav aria-label={m.ui_sections()} className="flex overflow-x-auto border-b">
          {tabs}
        </nav>
      ) : null}
      {children}
    </section>
  )
}
