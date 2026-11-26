import type * as React from 'react'
import { Radio, RadioGroup as RadioGroupPrimitive, RadioIndicator } from '@ui-sdk/react/radio'
import { cn } from 'cn'

type RadioGroupProps<T extends string> = Omit<React.ComponentProps<typeof RadioGroupPrimitive<T>>, 'className'> & {
  className?: string
}

function RadioGroup<T extends string = string>({ className, ...props }: RadioGroupProps<T>) {
  return <RadioGroupPrimitive<T> className={cn('grid w-full gap-2', className)} {...props} />
}

type RadioGroupItemProps = Omit<React.ComponentProps<typeof Radio>, 'className' | 'children'> & {
  className?: string
}

function RadioGroupItem({ className, ...props }: RadioGroupItemProps) {
  return (
    <Radio
      className={cn(
        'group/radio-group-item peer relative mt-0 flex aspect-square size-4 shrink-0 rounded-full border border-input bg-transparent p-0 outline-none group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-highlight data-checked:border-highlight data-checked:bg-highlight data-checked:text-highlight-foreground group-has-[:focus-visible]/field-label:data-checked:border-highlight',
        className,
      )}
      {...props}
    >
      <RadioIndicator className="flex size-4 items-center justify-center bg-transparent">
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-highlight-foreground" />
      </RadioIndicator>
    </Radio>
  )
}

export { RadioGroup, RadioGroupItem }
