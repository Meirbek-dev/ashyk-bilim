import { PanelLeft, PanelRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'

import { IconButton } from '../icon-button'
import { SheetPanel } from '../sheet-panel'

type FocusPageProps = {
  /** A kit Link (variant ghost) back to where the user came from. */
  back: ReactNode
  /** The context: activity, attempt or submission name. */
  title: string
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

/** The focus layout (DESIGN 6): no navigation, a top bar, panels that become sheets when narrow. */
export function FocusPage({
  back,
  title,
  saveStatus,
  actions,
  contents,
  contentsSheet,
  aside,
  wide = false,
  children,
}: FocusPageProps) {
  return (
    <div className="@container flex min-h-dvh flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4 @3xl:px-6">
        {back}
        {contents ? (
          <div className="@5xl:hidden">
            <SheetPanel
              side="left"
              title={m.ui_contents()}
              open={contentsSheet?.open}
              onOpenChange={contentsSheet?.onOpenChange}
              trigger={<IconButton label={m.ui_contents()} icon={<PanelLeft aria-hidden />} />}
            >
              {contents}
            </SheetPanel>
          </div>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</p>
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
          <nav aria-label={m.ui_contents()} className="hidden w-72 shrink-0 overflow-y-auto border-r p-4 @5xl:block">
            {contents}
          </nav>
        ) : null}
        <main className={`mx-auto w-full px-4 py-gutter @3xl:px-6 ${wide ? '' : 'max-w-prose'}`}>{children}</main>
        {aside ? (
          <aside aria-label={aside.label} className="hidden w-96 shrink-0 overflow-y-auto border-l p-4 @5xl:block">
            {aside.content}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
