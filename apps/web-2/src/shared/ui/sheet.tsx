import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { m } from '#/paraglide/messages'

import { IconButton } from './icon-button'

const sides = {
  left: 'left-0 border-r data-ending-style:-translate-x-full data-starting-style:-translate-x-full',
  right: 'right-0 border-l data-ending-style:translate-x-full data-starting-style:translate-x-full',
}

type SheetProps = {
  /** The button that opens it; none when the URL opens it (the selected item, R-07: pass `open` + `onOpenChange`). */
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  side: keyof typeof sides
  children: ReactNode
}

/** A side panel over the page: filters, focus-layout panels at phone width, a list's selected item (DESIGN 6). */
export function Sheet({ trigger, open, onOpenChange, title, side, children }: SheetProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={next => onOpenChange?.(next)}>
      {trigger ? <BaseDialog.Trigger render={trigger} /> : null}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-background/80 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup
          className={`fixed inset-y-0 z-50 flex w-full max-w-sm flex-col gap-4 bg-popover p-gutter text-popover-foreground shadow-lg transition-transform duration-200 ${sides[side]}`}
        >
          <div className="flex items-center justify-between gap-4">
            <BaseDialog.Title className="text-lg font-semibold">{title}</BaseDialog.Title>
            <BaseDialog.Close render={<IconButton label={m.ui_close()} icon={<X aria-hidden />} />} />
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto">{children}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
