import type * as React from 'react'
import { Input as InputPrimitive } from '@ui-sdk/react/input'
import { cn } from 'cn'

type InputProps = Omit<React.ComponentProps<typeof InputPrimitive>, 'className'> & {
  className?: string
}

function Input({ className, ...props }: InputProps) {
  return (
    <InputPrimitive
      className={cn(
        'h-control w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-base text-inherit shadow-control transition-[color,border-color,box-shadow] outline-none hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_25%)] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
