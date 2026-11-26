'use client'

import type * as React from 'react'
import {
  Slider as SliderPrimitive,
  SliderControl as SliderControlPrimitive,
  SliderIndicator as SliderIndicatorPrimitive,
  SliderThumb as SliderThumbPrimitive,
  SliderTrack as SliderTrackPrimitive,
} from '@ui-sdk/react/slider'
import { cn } from 'cn'

type Classed<P> = Omit<P, 'className'> & { className?: string }

function Slider<Value extends number | number[] = number>({
  className,
  ...props
}: Classed<React.ComponentProps<typeof SliderPrimitive<Value>>>) {
  return (
    <SliderPrimitive<Value>
      className={cn(
        'flex w-full min-w-0 flex-col gap-2 data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto',
        className,
      )}
      {...props}
    />
  )
}

function SliderControl({ className, ...props }: Classed<React.ComponentProps<typeof SliderControlPrimitive>>) {
  return (
    <SliderControlPrimitive
      className={cn(
        'relative flex h-5 w-full cursor-pointer touch-none items-center select-none data-disabled:cursor-not-allowed data-[orientation=vertical]:h-full data-[orientation=vertical]:w-5 data-[orientation=vertical]:justify-center',
        className,
      )}
      {...props}
    />
  )
}

function SliderTrack({ className, ...props }: Classed<React.ComponentProps<typeof SliderTrackPrimitive>>) {
  return (
    <SliderTrackPrimitive
      className={cn(
        'relative h-1 w-full rounded-full bg-input data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1',
        className,
      )}
      {...props}
    />
  )
}

function SliderIndicator({ className, ...props }: Classed<React.ComponentProps<typeof SliderIndicatorPrimitive>>) {
  return (
    <SliderIndicatorPrimitive
      className={cn(
        'rounded-full bg-highlight data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
        className,
      )}
      {...props}
    />
  )
}

function SliderThumb({ className, ...props }: Classed<React.ComponentProps<typeof SliderThumbPrimitive>>) {
  return (
    <SliderThumbPrimitive
      className={cn(
        'block size-4 rounded-full border border-highlight bg-background shadow-control transition-colors outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring/50 data-disabled:opacity-100',
        className,
      )}
      {...props}
    />
  )
}

export { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack }
