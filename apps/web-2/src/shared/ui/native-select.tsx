import type * as React from 'react'
import { useFieldControl } from '@ui-sdk/react/field'
import { cn } from 'cn'
import { ChevronDownIcon } from 'lucide-react'

type NativeSelectProps = Omit<React.ComponentProps<'select'>, 'size'> & {
  size?: 'sm' | 'default'
}

function NativeSelect({ className, size = 'default', ...props }: NativeSelectProps) {
  // A native select is no ui-sdk control: it joins the Field around it (label, description, invalid) here.
  const field = useFieldControl()
  const select = field ? field.props({ ...props, name: props.name ?? field.name }) : props
  return (
    <div
      className={cn('group/native-select relative w-fit has-[select:disabled]:opacity-50', className)}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-size={size}
        className="h-control w-full min-w-0 appearance-none rounded-md border border-input bg-card py-1 pr-8 pl-2.5 text-sm shadow-control transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_25%)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5"
        {...select}
        data-slot="native-select"
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
  return (
    <option data-slot="native-select-option" className={cn('bg-[Canvas] text-[CanvasText]', className)} {...props} />
  )
}

export { NativeSelect, NativeSelectOption }
