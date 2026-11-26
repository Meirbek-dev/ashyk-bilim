import type * as React from 'react'
import { Textarea as TextareaPrimitive } from '@ui-sdk/react/textarea'
import { cn } from 'cn'

type TextareaProps = Omit<React.ComponentProps<typeof TextareaPrimitive>, 'className'> & {
  className?: string
}

function Textarea({ className, ...props }: TextareaProps) {
  return (
    <TextareaPrimitive
      className={cn(
        'flex field-sizing-content min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-inherit shadow-control transition-[color,border-color,box-shadow] outline-none hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_25%)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
