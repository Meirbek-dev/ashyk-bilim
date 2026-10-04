import { Plus, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { ChoiceOption, ChoiceVariant } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { Button } from '#/shared/ui/button'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldLabel, FieldLegend, FieldSet } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

import { newOption } from '../model/items'

const radio = (option: ChoiceOption, at: number) => (
  <RadioGroupItem value={option.id} aria-label={m.assessments_option_correct({ number: at + 1 })} />
)

type ChoiceOptionsProps = {
  variant: ChoiceVariant
  options: ChoiceOption[]
  onChange: (options: ChoiceOption[]) => void
  editable: boolean
}

/**
 * The options and the correct mark: a radio per option (one answer), a checkbox (several), or the two fixed
 * true/false options. The last option cannot be removed.
 */
export function ChoiceOptions({ variant, options, onChange, editable }: ChoiceOptionsProps) {
  const id = useId()
  const patch = (at: number, change: Partial<ChoiceOption>) =>
    onChange(options.map((option, index) => (index === at ? { ...option, ...change } : option)))
  const correct = options.find(option => option.is_correct)?.id ?? ''

  const row = (option: ChoiceOption, at: number, mark: ReactNode) => (
    <div key={option.id} className="flex items-center gap-2">
      {mark}
      <Input
        aria-label={m.assessments_option_text({ number: at + 1 })}
        value={option.text ?? ''}
        disabled={!editable}
        onChange={event => patch(at, { text: event.target.value })}
      />
      <IconButton
        label={m.assessments_option_remove({ number: at + 1 })}
        icon={<X aria-hidden />}
        disabled={!editable || options.length <= 1}
        onClick={() => onChange(options.filter((_, index) => index !== at))}
      />
    </div>
  )
  const checkbox = (option: ChoiceOption, at: number) => (
    <Checkbox
      aria-label={m.assessments_option_correct({ number: at + 1 })}
      checked={option.is_correct === true}
      disabled={!editable}
      onCheckedChange={checked => patch(at, { is_correct: checked })}
    />
  )
  const trueFalse = (option: ChoiceOption) => (
    <Field key={option.id} orientation="horizontal">
      <RadioGroupItem id={`${id}-${option.id}`} value={option.id} />
      <FieldLabel htmlFor={`${id}-${option.id}`} className="font-normal">
        {option.id === 'true' ? m.assessments_option_true() : m.assessments_option_false()}
      </FieldLabel>
    </Field>
  )

  return (
    <FieldSet>
      <FieldLegend id={`${id}-legend`} variant="label">
        {m.assessments_correct_legend()}
      </FieldLegend>
      {variant === 'multiple_choice' ? (
        <div className="flex flex-col gap-2">{options.map((option, at) => row(option, at, checkbox(option, at)))}</div>
      ) : (
        <RadioGroup
          aria-labelledby={`${id}-legend`}
          value={correct}
          disabled={!editable}
          onValueChange={value => onChange(options.map(option => ({ ...option, is_correct: option.id === value })))}
        >
          {variant === 'true_false'
            ? options.map(trueFalse)
            : options.map((option, at) => row(option, at, radio(option, at)))}
        </RadioGroup>
      )}
      {variant === 'true_false' || !editable ? null : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...options, newOption()])}>
            <Plus data-icon="inline-start" aria-hidden />
            {m.assessments_option_add()}
          </Button>
        </div>
      )}
    </FieldSet>
  )
}
