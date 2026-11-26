import type * as React from 'react'
import {
  Popover as PopoverPrimitive,
  PopoverContent as PopoverPrimitiveContent,
  PopoverTitle as PopoverPrimitiveTitle,
  PopoverTrigger,
} from '@ui-sdk/react/popover'
import { cn } from 'cn'

import { usePopupRoot } from '#/shared/ui/body-container'

function Popover({ container, open, ...props }: React.ComponentProps<typeof PopoverPrimitive>) {
  return <PopoverPrimitive {...props} {...usePopupRoot(container, open)} />
}

type WithClassName<P> = Omit<P, 'className'> & { className?: string }

function PopoverContent({
  className,
  sideOffset = 4,
  ...props
}: WithClassName<React.ComponentProps<typeof PopoverPrimitiveContent>>) {
  return (
    <PopoverPrimitiveContent
      sideOffset={sideOffset}
      className={cn(
        'flex w-72 max-w-none origin-(--transform-origin) flex-col gap-3 rounded-lg border-0 bg-popover p-4 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95',
        className,
      )}
      {...props}
    />
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popover-header" className={cn('flex flex-col gap-0.5 text-sm', className)} {...props} />
}

function PopoverTitle({ className, ...props }: WithClassName<React.ComponentProps<typeof PopoverPrimitiveTitle>>) {
  return <PopoverPrimitiveTitle className={cn('text-sm font-medium', className)} {...props} />
}

export { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger }
