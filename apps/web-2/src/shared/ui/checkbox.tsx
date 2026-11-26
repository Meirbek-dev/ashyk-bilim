import type * as React from 'react'
import { Checkbox as CheckboxPrimitive, CheckboxIndicator } from '@ui-sdk/react/checkbox'
import { cn } from 'cn'
import { CheckIcon, MinusIcon } from 'lucide-react'

type CheckboxProps = Omit<React.ComponentProps<typeof CheckboxPrimitive>, 'className' | 'children'> & {
  className?: string
}

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive
      className={cn(
        'peer relative mt-0 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-transparent p-0 text-current transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-highlight data-checked:border-highlight data-checked:bg-highlight data-checked:text-highlight-foreground data-indeterminate:border-highlight data-indeterminate:bg-highlight data-indeterminate:text-highlight-foreground group-has-[:focus-visible]/field-label:data-checked:border-highlight',
        className,
      )}
      {...props}
    >
      {state => (
        <CheckboxIndicator className="grid place-content-center text-current transition-none [&>svg]:size-3.5">
          {state.indeterminate ? <MinusIcon aria-hidden /> : <CheckIcon aria-hidden />}
        </CheckboxIndicator>
      )}
    </CheckboxPrimitive>
  )
}

export { Checkbox }
