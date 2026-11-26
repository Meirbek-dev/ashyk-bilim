import * as React from 'react'
import {
  Drawer as DrawerPrimitive,
  DrawerBackdrop as DrawerBackdropPrimitive,
  DrawerClose as DrawerClosePrimitive,
  DrawerContent as DrawerContentPrimitive,
  DrawerTitle as DrawerTitlePrimitive,
  DrawerTrigger as DrawerTriggerPrimitive,
  type DrawerProps,
} from '@ui-sdk/react/drawer'
import { cn } from 'cn'

import { m } from '#/paraglide/messages'

import { usePopupRoot } from '#/shared/ui/body-container'
import { Button } from '#/shared/ui/button.tsx'
import { XIcon } from 'lucide-react'

function Sheet({ container, open, side = 'right', ...props }: DrawerProps) {
  return <DrawerPrimitive side={side} {...props} {...usePopupRoot(container, open)} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DrawerBackdropPrimitive>) {
  return <DrawerBackdropPrimitive className={cn('bg-scrim', className)} {...props} />
}

// No position or translate here: the drawer places and slides the sheet (a fade under reduced motion).
function SheetContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DrawerContentPrimitive> & {
  showCloseButton?: boolean
}) {
  return (
    <>
      <SheetOverlay />
      <DrawerContentPrimitive
        className={cn(
          'flex max-h-none flex-col gap-4 border-0 bg-popover bg-clip-padding p-0 text-sm text-popover-foreground shadow-lg data-[side=bottom]:h-auto data-[side=bottom]:max-w-none data-[side=bottom]:border-t data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:max-w-none data-[side=left]:border-r data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:max-w-none data-[side=right]:border-l data-[side=top]:h-auto data-[side=top]:max-w-none data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
          className,
        )}
        {...props}
      >
        {state => (
          <>
            {typeof children === 'function' ? children(state) : children}
            {showCloseButton && (
              <DrawerClosePrimitive
                aria-label={m.ui_close()}
                render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
              >
                <XIcon aria-hidden />
              </DrawerClosePrimitive>
            )}
          </>
        )}
      </DrawerContentPrimitive>
    </>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1 px-5 pt-5 pb-2', className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DrawerTitlePrimitive>) {
  return <DrawerTitlePrimitive className={cn('text-xl font-medium text-foreground', className)} {...props} />
}

export { Sheet, DrawerTriggerPrimitive as SheetTrigger, SheetContent, SheetHeader, SheetTitle }
