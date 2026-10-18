import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { ChoiceBody, ItemAnswer } from '#/shared/api/gen/types.gen'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldLabel, FieldLegend, FieldSet } from '#/shared/ui/field'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

type ChoiceProps = {
  body: ChoiceBody
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

/**
 * Single choice and true / false: radios; multiple choice: checkboxes (B-ATT-07). Options in the server's order, each a
 * whole-row choice card (the kit's FieldLabel around a Field): a large target on a phone, the pick tinted.
 */
export function ChoiceItem({ body, answer, onChange, disabled }: ChoiceProps) {
  const id = useId()
  const selected = answer?.kind === 'choice' ? (answer.selected ?? []) : []
  const options = body.options ?? []
  const multiple = body.multiple === true || body.variant === 'multiple_choice'
  const pick = (next: string[]) => onChange({ kind: 'choice', selected: next })
  const legend = (
    <FieldLegend id={`${id}-legend`} variant="label">
      {multiple ? m.attempt_choose_many() : m.attempt_choose_one()}
    </FieldLegend>
  )
  if (!multiple)
    return (
      <FieldSet>
        {legend}
        <RadioGroup
          value={selected[0] ?? ''}
          onValueChange={value => pick([String(value)])}
          aria-labelledby={`${id}-legend`}
          disabled={disabled}
        >
          {options.map(option => (
            <FieldLabel key={option.id} htmlFor={`${id}-${option.id}`} className="font-normal">
              <Field orientation="horizontal" className="min-h-row items-center">
                <RadioGroupItem id={`${id}-${option.id}`} value={option.id} />
                <span className="wrap-anywhere">{option.text}</span>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </FieldSet>
    )
  return (
    <FieldSet>
      {legend}
      {options.map(option => (
        <FieldLabel key={option.id} htmlFor={`${id}-${option.id}`} className="font-normal">
          <Field orientation="horizontal" className="min-h-row items-center">
            <Checkbox
              id={`${id}-${option.id}`}
              checked={selected.includes(option.id)}
              disabled={disabled}
              onCheckedChange={checked =>
                pick(checked ? [...selected, option.id] : selected.filter(value => value !== option.id))
              }
            />
            <span className="wrap-anywhere">{option.text}</span>
          </Field>
        </FieldLabel>
      ))}
    </FieldSet>
  )
}
