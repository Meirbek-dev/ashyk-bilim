import * as React from 'react'
import {
  Dialog as DialogPrimitive,
  DialogBackdrop as DialogBackdropPrimitive,
  DialogClose as DialogClosePrimitive,
  DialogContent as DialogContentPrimitive,
  DialogDescription as DialogDescriptionPrimitive,
  DialogTitle as DialogTitlePrimitive,
  DialogTrigger as DialogTriggerPrimitive,
  type DialogProps,
} from '@ui-sdk/react/dialog'
import { cn } from 'cn'

import { m } from '#/paraglide/messages'

import { usePopupRoot } from '#/shared/ui/body-container'
import { Button } from '#/shared/ui/button.tsx'
import { XIcon } from 'lucide-react'

function Dialog({ container, open, ...props }: DialogProps) {
  return <DialogPrimitive {...props} {...usePopupRoot(container, open)} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogBackdropPrimitive>) {
  return (
    <DialogBackdropPrimitive
      className={cn(
        'fixed inset-0 isolate z-50 bg-scrim transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogContentPrimitive> & {
  showCloseButton?: boolean
}) {
  return (
    <>
      <DialogOverlay />
      <DialogContentPrimitive
        className={cn(
          'fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] gap-4 overflow-y-auto overscroll-contain rounded-xl border-0 bg-popover p-6 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 transition-[opacity,scale] duration-100 outline-none sm:max-w-sm data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none',
          className,
        )}
        {...props}
      >
        {state => (
          <>
            {typeof children === 'function' ? children(state) : children}
            {showCloseButton && (
              <DialogClosePrimitive
                aria-label={m.ui_close()}
                render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
              >
                <XIcon aria-hidden />
              </DialogClosePrimitive>
            )}
          </>
        )}
      </DialogContentPrimitive>
    </>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        '-mx-6 -mb-6 mt-2 flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClosePrimitive render={<Button variant="outline" />}>{m.ui_close()}</DialogClosePrimitive>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogTitlePrimitive>) {
  return <DialogTitlePrimitive className={cn('text-xl font-medium', className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogDescriptionPrimitive>) {
  return (
    <DialogDescriptionPrimitive
      className={cn(
        'm-0 text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClosePrimitive as DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTriggerPrimitive as DialogTrigger,
}
