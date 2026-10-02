import { useId, type ComponentProps } from 'react'

type TextFieldProps = Omit<ComponentProps<'input'>, 'className' | 'id'> & { label: string; hint?: string }

/** Placeholder until the kit (phase 1): a labelled input with an optional hint. */
export function TextField({ label, hint, ...props }: TextFieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="rounded-md border border-input bg-background px-3 py-2 focus-visible:ring-2 focus-visible:ring-ring"
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
