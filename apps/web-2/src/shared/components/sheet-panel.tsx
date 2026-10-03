import type { ReactElement, ReactNode } from 'react'

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '#/shared/ui/sheet'

type SheetPanelProps = {
  /** The button that opens it; none when the URL opens it (the selected item, R-07: pass `open` + `onOpenChange`). */
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  side: 'left' | 'right'
  children: ReactNode
}

/** A side panel over the page on the stock Sheet: filters, focus-layout panels when narrow, a selected list item. */
export function SheetPanel({ trigger, open, onOpenChange, title, side, children }: SheetPanelProps) {
  return (
    <Sheet open={open} onOpenChange={next => onOpenChange?.(next)}>
      {trigger ? <SheetTrigger render={trigger} /> : null}
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
