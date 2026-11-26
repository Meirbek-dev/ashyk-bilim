import type * as React from 'react'
import {
  Tooltip as TooltipPrimitive,
  TooltipArrow,
  TooltipContent as TooltipPrimitiveContent,
  TooltipTrigger,
} from '@ui-sdk/react/tooltip'
import { cn } from 'cn'

import { usePopupRoot } from '#/shared/ui/body-container'

function Tooltip({ container, open, ...props }: React.ComponentProps<typeof TooltipPrimitive>) {
  return <TooltipPrimitive {...props} {...usePopupRoot(container, open)} />
}

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitiveContent>, 'className' | 'children'> & {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <TooltipPrimitiveContent
      sideOffset={sideOffset}
      className={cn(
        'inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-instant:animate-none data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95',
        className,
      )}
      {...props}
    >
      {children}
      <TooltipArrow className="absolute z-50 size-2.5 rotate-45 rounded-[2px] bg-inherit data-[side=bottom]:bottom-[calc(100%-2px)] data-[side=bottom]:left-(--arrow-offset) data-[side=bottom]:-ml-1.25 data-[side=bottom]:translate-y-1/2 data-[side=left]:top-(--arrow-offset) data-[side=left]:left-[calc(100%-2px)] data-[side=left]:-mt-1.25 data-[side=left]:-translate-x-1/2 data-[side=right]:top-(--arrow-offset) data-[side=right]:right-[calc(100%-2px)] data-[side=right]:-mt-1.25 data-[side=right]:translate-x-1/2 data-[side=top]:top-[calc(100%-2px)] data-[side=top]:left-(--arrow-offset) data-[side=top]:-ml-1.25 data-[side=top]:-translate-y-1/2" />
    </TooltipPrimitiveContent>
  )
}

export { Tooltip, TooltipContent, TooltipTrigger }
