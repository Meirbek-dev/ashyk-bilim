import { useId } from 'react'

import { m } from '#/paraglide/messages'
import { Field, FieldLabel } from '#/shared/ui/field'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { CHOICE_VARIANTS, choiceVariant, withVariant, type Choice } from '../model/items'
import { ChoiceOptions } from './choice-options'
import { kindLabels } from './labels'
import { MarkdownField } from './markdown-field'

type ChoiceFieldsProps = { body: Choice; onChange: (body: Choice) => void; editable: boolean }

/** A choice question: its variant, the options with the correct mark, and the explanation shown after answering. */
export function ChoiceFields({ body, onChange, editable }: ChoiceFieldsProps) {
  const id = useId()
  const variant = body.variant ?? (body.multiple ? 'multiple_choice' : 'single_choice')
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={id}>{m.assessments_field_variant()}</FieldLabel>
        <NativeSelect
          id={id}
          value={variant}
          disabled={!editable}
          onChange={event => {
            const next = choiceVariant(event.target.value)
            if (next) onChange(withVariant(body, next))
          }}
        >
          {CHOICE_VARIANTS.map(value => (
            <NativeSelectOption key={value} value={value}>
              {kindLabels[value]()}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <ChoiceOptions
        variant={variant}
        options={body.options ?? []}
        onChange={options => onChange({ ...body, options })}
        editable={editable}
      />
      <MarkdownField
        label={m.assessments_field_explanation()}
        value={body.explanation ?? ''}
        onChange={explanation => onChange({ ...body, explanation: explanation || null })}
        editable={editable}
      />
    </div>
  )
}
