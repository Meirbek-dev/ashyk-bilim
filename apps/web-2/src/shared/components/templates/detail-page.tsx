import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { revealCurrentTab } from './settings-page'

type DetailPageProps = {
  /** A ghost link with ArrowLeft above the title: back to the list the object belongs to. */
  back?: ReactNode
  /** The object's picture: a course's or a collection's `CourseCover`. */
  cover?: ReactNode
  /** `hero`: the picture stands left of a large title (the page a learner reads); `thumb`: a small
   * picture before the title (a workspace whose tabs are the content). */
  coverSize?: 'hero' | 'thumb'
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

/** An object's page (DESIGN 6): cover, title, meta, status, primary action, tab links, then the tab's route. */
export function DetailPage(props: DetailPageProps) {
  const { back, cover, coverSize = 'hero', title, meta, status, primaryAction, tabs, children } = props
  const hero = cover && coverSize === 'hero'
  const heading = (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* A workspace's tabs are its content: a 96-character course name took six lines above them on a phone and
            three at 1440 px, so its title is a step smaller and stops at two lines (the full name is its tooltip). */}
        <h1
          title={hero ? undefined : title}
          className={`min-w-0 font-semibold wrap-anywhere ${hero ? 'text-3xl' : 'line-clamp-2 text-xl'}`}
        >
          {title}
        </h1>
        {status}
      </div>
      {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
    </div>
  )
  return (
    <section className="@container flex flex-col gap-gutter">
      {back ? <div className="-mb-3 -ml-2.5 self-start">{back}</div> : null}
      {hero ? (
        <header className="grid gap-8 pt-4 @3xl:grid-cols-[20rem_minmax(0,1fr)] @3xl:items-center @3xl:gap-10">
          <div>{cover}</div>
          <div className="flex min-w-0 flex-col gap-6">
            {heading}
            {primaryAction ? <div className="flex flex-col @2xl:flex-row">{primaryAction}</div> : null}
          </div>
        </header>
      ) : (
        <header className="flex flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {cover ? <div className="hidden w-28 shrink-0 @xl:block">{cover}</div> : null}
            {heading}
          </div>
          {primaryAction ? <div className="flex flex-col @2xl:block">{primaryAction}</div> : null}
        </header>
      )}
      {tabs ? (
        <nav
          ref={revealCurrentTab}
          aria-label={m.ui_sections()}
          className="relative flex gap-6 overflow-x-auto border-b"
        >
          {tabs}
        </nav>
      ) : null}
      {children}
    </section>
  )
}
