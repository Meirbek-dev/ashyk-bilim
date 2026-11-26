'use client'

import * as React from 'react'
import {
  Toast as ToastPrimitive,
  ToastAction as ToastActionPrimitive,
  ToastClose as ToastClosePrimitive,
  ToastDescription as ToastDescriptionPrimitive,
  ToastRegion,
  ToastTitle as ToastTitlePrimitive,
  toast,
  type ToastData,
  type ToastType,
} from '@ui-sdk/react/toast'
import { cn } from 'cn'

import { m } from '#/paraglide/messages'

import { Button } from '#/shared/ui/button.tsx'
import { XIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from 'lucide-react'

type WithClassName<P> = Omit<P, 'className'> & { className?: string }

type ToastViewportProps = WithClassName<React.ComponentProps<typeof ToastRegion>>

function ToastViewport({ className, ...props }: ToastViewportProps) {
  return (
    <ToastRegion
      aria-label={m.ui_toast_region()}
      pendingAnnouncement={m.ui_loading()}
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-4 mx-auto my-0 w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full',
        className,
      )}
      {...props}
    />
  )
}

function Toast({ className, ...props }: WithClassName<React.ComponentProps<typeof ToastPrimitive>>) {
  return (
    <ToastPrimitive
      className={cn(
        'group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] block w-full origin-bottom rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-lg will-change-transform outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        '[--gap:0.75rem] [--height:var(--toast-front-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-y,0px))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]',
        'h-(--height) [transform:translateX(var(--toast-swipe-x,0px))_translateY(calc(var(--toast-swipe-y,0px)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms] data-swiping:[transition:none]',
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-x,0px))_translateY(var(--offset-y))]',
        'motion-safe:data-starting-style:[transform:translateY(150%)]',
        'motion-safe:[&[data-ending-style][data-front]:not([data-swipe-direction])]:[transform:translateY(150%)] [&[data-ending-style]:not([data-front])]:opacity-0',
        'data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-y,0px)+150%))]',
        'data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-x,0px)-150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-x,0px)+150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-y,0px)-150%))]',
        'motion-reduce:[transition-property:opacity] motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="toast-content"
      className={cn(
        'flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] group-[:not([data-front],[data-expanded])]/toast:invisible group-[:not([data-front],[data-expanded])]/toast:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: WithClassName<React.ComponentProps<typeof ToastTitlePrimitive>>) {
  return <ToastTitlePrimitive className={cn('flex-none text-sm font-medium', className)} {...props} />
}

function ToastDescription({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof ToastDescriptionPrimitive>>) {
  return (
    <ToastDescriptionPrimitive
      className={cn('order-none flex-none text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: WithClassName<React.ComponentProps<typeof ToastActionPrimitive>>) {
  return <ToastActionPrimitive render={render} className={cn('shrink-0', className)} {...props} />
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}: WithClassName<React.ComponentProps<typeof ToastClosePrimitive>>) {
  return (
    <ToastClosePrimitive
      aria-label={m.ui_close()}
      render={render}
      className={cn(
        "relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastClosePrimitive>
  )
}

const toastIcons: Partial<Record<ToastType, React.ReactNode>> = {
  success: <CircleCheckIcon aria-hidden="true" />,
  info: <InfoIcon aria-hidden="true" />,
  warning: <TriangleAlertIcon aria-hidden="true" />,
  error: <OctagonXIcon className="text-destructive" aria-hidden="true" />,
  loading: <Loader2Icon className="animate-spin" aria-hidden="true" />,
}

function ToastIcon({ type }: { type: ToastType }) {
  const icon = toastIcons[type]
  if (!icon) {
    return null
  }
  return (
    <span data-slot="toast-icon" className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4">
      {icon}
    </span>
  )
}

function renderToast(item: ToastData<React.ReactNode>) {
  return (
    <Toast>
      <ToastContent>
        <ToastIcon type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  )
}

function Toaster(props: Omit<ToastViewportProps, 'children'>) {
  return <ToastViewport {...props}>{renderToast}</ToastViewport>
}

export { Toaster, toast }
