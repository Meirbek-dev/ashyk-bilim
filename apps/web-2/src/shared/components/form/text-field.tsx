import { useId, useLayoutEffect, useRef, type ComponentProps } from 'react'

import { Input } from '#/shared/ui/input'

import { errorText } from './field-errors'
import { describedBy, FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

type TextFieldProps = Pick<ComponentProps<'input'>, 'type' | 'autoComplete' | 'inputMode' | 'required'> & {
  label: string
  description?: string
}

/** `<form.AppField name="x">{f => <f.TextField label={...} />}</form.AppField>`: stock `Input` in a stock `Field`. */
export function TextField({ label, description, ...input }: TextFieldProps) {
  const field = useFieldContext<string | null | undefined>()
  const id = useId()
  const error = errorText(field.state.meta.errors)
  const ref = useRef<HTMLInputElement>(null)
  // On a server-rendered page, text typed before hydration is in the input but not in the form: take it over. Later
  // renders find the two equal (the input is controlled), so this acts once; in the commit, before the next key.
  useLayoutEffect(() => {
    const typed = ref.current?.value
    if (typed && typed !== (field.state.value ?? '')) field.handleChange(typed)
  }, [field])
  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      <Input
        ref={ref}
        id={id}
        name={field.name}
        value={field.state.value ?? ''}
        onChange={event => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, description, error)}
        {...input}
      />
    </FieldShell>
  )
}
