import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'

type SettingsPageProps = {
  title: string
  /** Kit `<Link variant="tab">` items, one per settings route: a column when wide, the tab row when narrow. None for a
   * page of one section: a nav with a single item points nowhere. */
  nav?: ReactNode
  /** SettingsSection blocks, each its own form. */
  children: ReactNode
}

/**
 * A tab row that scrolls sideways (390 px) shows its current tab: a ref callback, so the last tab of a deep link is not
 * cut off at the edge on load.
 */
export function revealCurrentTab(row: HTMLElement | null) {
  const current = row?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!row || !current) return
  const end = current.offsetLeft + current.offsetWidth
  if (end > row.scrollLeft + row.clientWidth) row.scrollLeft = end - row.clientWidth
}

/** Settings (DESIGN 6): section links, then stacked sections that each save on their own. */
export function SettingsPage({ title, nav, children }: SettingsPageProps) {
  return (
    <section className="@container flex flex-col gap-gutter">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex flex-col gap-gutter @3xl:flex-row">
        {nav ? (
          <nav
            ref={revealCurrentTab}
            aria-label={m.ui_sections()}
            className="relative flex shrink-0 overflow-x-auto border-b @3xl:sticky @3xl:top-20 @3xl:w-48 @3xl:flex-col @3xl:self-start @3xl:border-b-0 @3xl:*:border-b-0 @3xl:*:border-l-2"
          >
            {nav}
          </nav>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-12">{children}</div>
      </div>
    </section>
  )
}
