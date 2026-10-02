import { Field as BaseField } from '@base-ui/react/field'
import type { ComponentProps } from 'react'

import { Field } from '../field'
import { controlClass } from './control-classes'
import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

type TextFieldProps = Pick<ComponentProps<'input'>, 'type' | 'autoComplete' | 'inputMode' | 'required'> & {
  label: string
  description?: string
}

/** `<form.AppField name="x">{f => <f.TextField label={...} />}</form.AppField>` */
export function TextField({ label, description, ...input }: TextFieldProps) {
  const field = useFieldContext<string | null | undefined>()
  return (
    <Field label={label} description={description} error={errorText(field.state.meta.errors)}>
      <BaseField.Control
        name={field.name}
        value={field.state.value ?? ''}
        onValueChange={value => field.handleChange(value)}
        onBlur={field.handleBlur}
        className={`h-control ${controlClass}`}
        {...input}
      />
    </Field>
  )
}
