'use client'

import type * as React from 'react'
import { Switch as SwitchPrimitive, SwitchThumb } from '@ui-sdk/react/switch'
import { cn } from 'cn'

type SwitchProps = Omit<React.ComponentProps<typeof SwitchPrimitive>, 'className' | 'children'> & {
  className?: string
  size?: 'sm' | 'default'
}

function Switch({ className, size = 'default', ...props }: SwitchProps) {
  return (
    <SwitchPrimitive
      data-size={size}
      className={cn(
        'peer group/switch relative mt-0 inline-flex shrink-0 items-center rounded-full border border-transparent p-0 transition-all outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-checked:bg-highlight data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchThumb className="pointer-events-none ms-0 block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-checked:bg-highlight-foreground group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0" />
    </SwitchPrimitive>
  )
}

export { Switch }
