import type * as React from 'react'
import { Toggle as TogglePrimitive } from '@ui-sdk/react/toggle'
import type { VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

import { buttonVariants } from './button'

type ToggleProps = Omit<React.ComponentProps<typeof TogglePrimitive>, 'className'> &
  VariantProps<typeof buttonVariants> & { className?: string }

/** A button that stays pressed: the button's looks (ghost by default), filled while pressed. */
function Toggle({ className, variant = 'ghost', size = 'default', ...props }: ToggleProps) {
  return (
    <TogglePrimitive
      className={cn(buttonVariants({ variant, size }), 'data-pressed:bg-muted data-pressed:text-foreground', className)}
      {...props}
    />
  )
}

export { Toggle }
