import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'

type SettingsPageProps = {
  title: string
  /** Kit `<Link variant="tab">` items, one per settings route: a column when wide, the tab row when narrow. */
  nav: ReactNode
  /** SettingsSection blocks, each its own form. */
  children: ReactNode
}

/** Settings (DESIGN 6): section links, then stacked sections that each save on their own. */
export function SettingsPage({ title, nav, children }: SettingsPageProps) {
  return (
    <section className="@container flex flex-col gap-gutter">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex flex-col gap-gutter @3xl:flex-row">
        <nav
          aria-label={m.ui_sections()}
          className="flex shrink-0 overflow-x-auto border-b @3xl:w-48 @3xl:flex-col @3xl:border-b-0"
        >
          {nav}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-12">{children}</div>
      </div>
    </section>
  )
}
