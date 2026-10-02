import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ReactElement, ReactNode, RefObject } from 'react'

import { m } from '#/paraglide/messages'

import { IconButton } from './icon-button'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The kit Button that opens it. */
  trigger: ReactElement
  title: string
  description?: string | undefined
  /** A confirmation: role alertdialog, no dismissal by an outside click. */
  alert?: boolean
  /** Where focus starts (a confirmation starts on Cancel). */
  initialFocus?: RefObject<HTMLElement | null>
  children?: ReactNode
  footer: ReactNode
}

/** The one dialog (spec 7.10). At phone width it is a full-width bottom sheet with the footer at the bottom. */
export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  alert = false,
  initialFocus,
  children,
  footer,
}: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={next => onOpenChange(next)} disablePointerDismissal={alert}>
      <BaseDialog.Trigger render={trigger} />
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-background/80 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup
          role={alert ? 'alertdialog' : 'dialog'}
          initialFocus={initialFocus}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-full flex-col gap-4 rounded-t-xl border bg-popover p-gutter text-popover-foreground shadow-lg transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-1/2 sm:rounded-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <BaseDialog.Title className="text-lg font-semibold">{title}</BaseDialog.Title>
              {description ? (
                <BaseDialog.Description className="text-sm text-muted-foreground">{description}</BaseDialog.Description>
              ) : null}
            </div>
            {alert ? null : <BaseDialog.Close render={<IconButton label={m.ui_close()} icon={<X aria-hidden />} />} />}
          </div>
          {children ? <div className="-mx-1 flex flex-col gap-4 overflow-y-auto px-1">{children}</div> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
