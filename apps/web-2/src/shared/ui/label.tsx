import type * as React from 'react'
import { Label as LabelPrimitive } from '@ui-sdk/react/label'
import { cn } from 'cn'

type LabelProps = Omit<React.ComponentProps<typeof LabelPrimitive>, 'className'> & {
  className?: string
}

function Label({ className, ...props }: LabelProps) {
  return (
    <LabelPrimitive
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-disabled:pointer-events-none group-data-disabled:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
