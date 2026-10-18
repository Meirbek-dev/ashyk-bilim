import { Search } from 'lucide-react'
import { type ChangeEvent, type ComponentProps, useId, useLayoutEffect, useRef } from 'react'

import { Input } from '#/shared/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '#/shared/ui/input-group'

import { errorText } from './field-errors'
import { describedBy, FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

type TextFieldProps = Pick<ComponentProps<'input'>, 'type' | 'autoComplete' | 'inputMode' | 'required'> & {
  label: string
  description?: string
}

/**
 * `<form.AppField name="x">{f => <f.TextField label={...} />}</form.AppField>`: stock `Input` in a stock `Field`.
 * `type="search"` draws a search box: magnifier and the label as placeholder; the label itself is for screen readers.
 */
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
  const search = input.type === 'search'
  const control = {
    ref,
    id,
    name: field.name,
    value: field.state.value ?? '',
    onChange: (event: ChangeEvent<HTMLInputElement>) => field.handleChange(event.target.value),
    onBlur: field.handleBlur,
    'aria-invalid': error !== undefined || undefined,
    'aria-describedby': describedBy(id, description, error),
    ...input,
  }
  return (
    <FieldShell id={id} label={label} description={description} error={error} labelHidden={search}>
      {search ? (
        <InputGroup className="h-control bg-card">
          <InputGroupInput placeholder={label} {...control} />
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input {...control} />
      )}
    </FieldShell>
  )
}
