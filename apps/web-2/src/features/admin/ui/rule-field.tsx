import { useId, useLayoutEffect, useRef, type ChangeEvent } from 'react'

import { errorText } from '#/shared/components/form/field-errors'
import { describedBy } from '#/shared/components/form/field-shell'
import { useFieldContext } from '#/shared/components/form/form-context'
import { FieldDescription, FieldError, FieldLabel } from '#/shared/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '#/shared/ui/input-group'

type RuleFieldProps = {
  label: string
  /** The value a blank box falls back to, in the box's placeholder. */
  placeholder: string
  /** «По умолчанию: 25». */
  description: string
  /** The unit inside the box. */
  suffix: string
}

/**
 * One XP rule as a ruled line: the source, the default, and a small box whose numbers line up with the boxes above and
 * below. Inside `form.AppField`, like `field.TextField`, and bound the same way.
 */
export function RuleField({ label, placeholder, description, suffix }: RuleFieldProps) {
  const field = useFieldContext<string | null | undefined>()
  const id = useId()
  const error = errorText(field.state.meta.errors)
  const ref = useRef<HTMLInputElement>(null)
  // Text typed before hydration is in the input but not in the form: take it over, as TextField does.
  useLayoutEffect(() => {
    const typed = ref.current?.value
    if (typed && typed !== (field.state.value ?? '')) field.handleChange(typed)
  }, [field])
  return (
    <div
      data-invalid={error !== undefined || undefined}
      className="group grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-x-4 gap-y-1 py-2"
    >
      <div className="flex min-w-0 flex-col gap-x-3 sm:flex-row sm:items-baseline sm:justify-between">
        <FieldLabel htmlFor={id} className="w-auto font-normal">
          {label}
        </FieldLabel>
        <FieldDescription id={`${id}-description`} className="shrink-0 text-xs tabular-nums">
          {description}
        </FieldDescription>
      </div>
      <InputGroup className="h-control">
        <InputGroupInput
          ref={ref}
          id={id}
          name={field.name}
          inputMode="numeric"
          placeholder={placeholder}
          value={field.state.value ?? ''}
          onChange={(event: ChangeEvent<HTMLInputElement>) => field.handleChange(event.target.value)}
          onBlur={field.handleBlur}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={describedBy(id, description, error)}
          className="text-right tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{suffix}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {error ? (
        <FieldError id={`${id}-error`} className="col-span-2 text-right">
          {error}
        </FieldError>
      ) : null}
    </div>
  )
}
