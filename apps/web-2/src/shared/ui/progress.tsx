import * as React from 'react'
import {
  Progress as ProgressPrimitive,
  ProgressIndicator as ProgressIndicatorPrimitive,
  ProgressTrack as ProgressTrackPrimitive,
  ProgressValue as ProgressValuePrimitive,
} from '@ui-sdk/react/progress'
import { cn } from 'cn'

type WithClassName<P> = Omit<P, 'className'> & { className?: string }

function Progress({
  className,
  children,
  ...props
}: Omit<WithClassName<React.ComponentProps<typeof ProgressPrimitive>>, 'children'> & {
  children?: React.ReactNode
}) {
  return (
    <ProgressPrimitive className={cn('flex w-auto min-w-0 flex-wrap gap-3', className)} {...props}>
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive>
  )
}

function ProgressTrack({ className, ...props }: WithClassName<React.ComponentProps<typeof ProgressTrackPrimitive>>) {
  return (
    <ProgressTrackPrimitive
      className={cn('relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted', className)}
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof ProgressIndicatorPrimitive>>) {
  return <ProgressIndicatorPrimitive className={cn('h-full bg-highlight transition-all', className)} {...props} />
}

function ProgressValue({ className, ...props }: WithClassName<React.ComponentProps<typeof ProgressValuePrimitive>>) {
  return (
    <ProgressValuePrimitive
      className={cn('ml-auto text-sm text-muted-foreground tabular-nums', className)}
      {...props}
    />
  )
}

export { Progress, ProgressValue }
