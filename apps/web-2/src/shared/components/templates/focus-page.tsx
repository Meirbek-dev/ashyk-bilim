import { PanelLeft, PanelRight } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'

import { IconButton } from '../icon-button'
import { SheetPanel } from '../sheet-panel'
import { SkipLink } from '../skip-link'

type FocusPageProps = {
  /** A kit Link (variant ghost) back to where the user came from. */
  back: ReactNode
  /** The context: activity, attempt or submission name. */
  title: string
  /** The title is the page's h1: for a screen whose content brings no heading of its own (an editor, results). */
  heading?: boolean
  saveStatus?: ReactNode
  actions?: ReactNode
  /** Left panel: the contents (activity list). */
  contents?: ReactNode
  /** The contents sheet of narrow screens, held by the page (a shortcut opens it, a picked item closes it). */
  contentsSheet?: { open: boolean; onOpenChange: (open: boolean) => void }
  /** Right panel: AI, rubric. */
  aside?: { label: string; content: ReactNode }
  /** Editors use the full width; reading stays at prose width. */
  wide?: boolean
  children: ReactNode
}

/**
 * The contents panel opens scrolled to the current item (`aria-current`): in a course of 40 activities the one being
 * studied was 1900 px down, out of sight. Only the panel scrolls, never the page. The bar and both panels stay put while
 * the page scrolls (an attempt's clock and «Сдать» stay in sight); a panel is viewport-tall under the bar (`h-14`), so
 * `pb-18` keeps its last rows reachable.
 */
function revealCurrentItem(panel: HTMLElement | null) {
  const current = panel?.querySelector<HTMLElement>('[aria-current="page"], [aria-current="step"]')
  if (!panel || !current) return
  const top = current.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop
  if (top + current.offsetHeight > panel.scrollTop + panel.clientHeight * 0.8)
    panel.scrollTop = top - panel.clientHeight / 3
}

/** The focus layout (DESIGN 6): no navigation, a top bar, panels that become sheets when narrow. */
export function FocusPage({
  back,
  title,
  heading = false,
  saveStatus,
  actions,
  contents,
  contentsSheet,
  aside,
  wide = false,
  children,
}: FocusPageProps) {
  const sheetContents = useRef<HTMLDivElement>(null)
  return (
    <div className="@container flex min-h-dvh flex-col">
      {/* As in the app shell: past the bar and a contents list of dozens of lessons, straight to the page. */}
      <SkipLink />
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background px-4 @3xl:px-6">
        {back}
        {contents ? (
          <div className="@5xl:hidden">
            <SheetPanel
              side="left"
              title={m.ui_contents()}
              open={contentsSheet?.open}
              onOpenChange={contentsSheet?.onOpenChange}
              trigger={<IconButton label={m.ui_contents()} icon={<PanelLeft aria-hidden />} />}
              // On a phone the sheet opens on the current item (focus scrolls it into view), not at the top.
              initialFocus={() =>
                sheetContents.current?.querySelector<HTMLElement>('[aria-current="page"], [aria-current="step"]') ??
                true
              }
            >
              <div ref={sheetContents}>{contents}</div>
            </SheetPanel>
          </div>
        ) : null}
        {heading ? (
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        ) : (
          <p className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</p>
        )}
        {saveStatus ? <div className="text-sm text-muted-foreground">{saveStatus}</div> : null}
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        {aside ? (
          <div className="@5xl:hidden">
            <SheetPanel
              side="right"
              title={aside.label}
              trigger={<IconButton label={aside.label} icon={<PanelRight aria-hidden />} />}
            >
              {aside.content}
            </SheetPanel>
          </div>
        ) : null}
      </header>
      <div className="flex flex-1">
        {contents ? (
          <nav aria-label={m.ui_contents()} className="hidden w-72 shrink-0 border-r @5xl:block">
            <div ref={revealCurrentItem} className="sticky top-14 max-h-dvh overflow-y-auto p-4 pb-18">
              {contents}
            </div>
          </nav>
        ) : null}
        <main
          id="main"
          tabIndex={-1}
          className={`mx-auto w-full px-4 py-gutter @3xl:px-6 ${wide ? '' : 'max-w-prose'}`}
        >
          {children}
        </main>
        {aside ? (
          <aside aria-label={aside.label} className="hidden w-96 shrink-0 border-l @5xl:block">
            <div className="sticky top-14 max-h-dvh overflow-y-auto p-4 pb-18">{aside.content}</div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
