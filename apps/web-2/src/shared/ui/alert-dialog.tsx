'use client'

import * as React from 'react'
import {
  AlertDialog as AlertDialogPrimitive,
  AlertDialogBackdrop as AlertDialogBackdropPrimitive,
  AlertDialogClose as AlertDialogClosePrimitive,
  AlertDialogContent as AlertDialogContentPrimitive,
  AlertDialogDescription as AlertDialogDescriptionPrimitive,
  AlertDialogTitle as AlertDialogTitlePrimitive,
  AlertDialogTrigger as AlertDialogTriggerPrimitive,
  type AlertDialogProps,
} from '@ui-sdk/react/alert-dialog'
import { cn } from 'cn'

import { usePopupRoot } from '#/shared/ui/body-container'
import { Button } from '#/shared/ui/button.tsx'

function AlertDialog({ container, open, ...props }: AlertDialogProps) {
  return <AlertDialogPrimitive {...props} {...usePopupRoot(container, open)} />
}

function AlertDialogOverlay({ className, ...props }: React.ComponentProps<typeof AlertDialogBackdropPrimitive>) {
  return (
    <AlertDialogBackdropPrimitive
      className={cn(
        'fixed inset-0 isolate z-50 bg-scrim transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogContentPrimitive> & {
  size?: 'default' | 'sm'
}) {
  return (
    <>
      <AlertDialogOverlay />
      <AlertDialogContentPrimitive
        data-size={size}
        className={cn(
          'group/alert-dialog-content fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-full gap-4 overflow-y-auto overscroll-contain rounded-xl border-0 bg-popover p-6 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 transition-[opacity,scale] duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none',
          className,
        )}
        {...props}
      />
    </>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        '-mx-6 -mb-6 mt-2 flex flex-col-reverse gap-2 border-t px-6 py-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogTitlePrimitive>) {
  return (
    <AlertDialogTitlePrimitive
      className={cn(
        'text-xl font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof AlertDialogDescriptionPrimitive>) {
  return (
    <AlertDialogDescriptionPrimitive
      className={cn(
        'm-0 text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

type CloseProps = React.ComponentProps<typeof AlertDialogClosePrimitive> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>

/** The agreeing answer: closes the dialog reporting `value="confirm"` (what `createConfirm` and agents read). */
function AlertDialogAction({ variant, size, ...props }: CloseProps) {
  return <AlertDialogClosePrimitive value="confirm" render={<Button variant={variant} size={size} />} {...props} />
}

function AlertDialogCancel({ variant = 'outline', size = 'default', ...props }: CloseProps) {
  return <AlertDialogClosePrimitive render={<Button variant={variant} size={size} />} {...props} />
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTriggerPrimitive as AlertDialogTrigger,
}
