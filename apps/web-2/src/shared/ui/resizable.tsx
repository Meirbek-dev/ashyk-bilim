import type * as React from 'react'
import {
  Resizable as ResizablePrimitive,
  ResizableHandle as ResizableHandlePrimitive,
  ResizablePanel as ResizablePanelPrimitive,
} from '@ui-sdk/react/resizable'
import { cn } from 'cn'

type Classed<P> = Omit<P, 'className'> & { className?: string }

// web.css frames a group as a bordered card at least 12rem tall and pads every panel: kit groups fill their box flush.
function Resizable({ className, ...props }: Classed<React.ComponentProps<typeof ResizablePrimitive>>) {
  return (
    <ResizablePrimitive
      className={cn('size-full min-h-0 rounded-none border-0 [font-size:inherit]', className)}
      {...props}
    />
  )
}

function ResizablePanel({ className, ...props }: Classed<React.ComponentProps<typeof ResizablePanelPrimitive>>) {
  return <ResizablePanelPrimitive className={cn('min-h-0 min-w-0 p-0', className)} {...props} />
}

function ResizableHandle({ className, ...props }: Classed<React.ComponentProps<typeof ResizableHandlePrimitive>>) {
  return (
    <ResizableHandlePrimitive
      className={cn(
        'bg-border transition-colors duration-150 outline-none hover:bg-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:bg-border data-dragging:bg-muted-foreground data-hovering:bg-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Resizable, ResizableHandle, ResizablePanel }
