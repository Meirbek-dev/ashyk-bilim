import { Plus, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { ChoiceOption, ChoiceVariant } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { useFocusNew } from '#/shared/lib/focus-new'
import { Button } from '#/shared/ui/button'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

import { newOption } from '../model/items'
import type { EditMode } from '../model/route'

// Each mark is disabled on its own: a disabled RadioGroup would also disable the option texts inside it (`wording`).
const radio = (option: ChoiceOption, at: number, disabled: boolean) => (
  <RadioGroupItem value={option.id} disabled={disabled} aria-label={m.assessments_option_correct({ number: at + 1 })} />
)

/** The two fixed true/false options, each with its label. */
const trueFalse = (option: ChoiceOption, id: string, disabled: boolean) => (
  <Field key={option.id} orientation="horizontal">
    <RadioGroupItem id={`${id}-${option.id}`} value={option.id} disabled={disabled} />
    <FieldLabel htmlFor={`${id}-${option.id}`} className="font-normal">
      {option.id === 'true' ? m.assessments_option_true() : m.assessments_option_false()}
    </FieldLabel>
  </Field>
)

type ChoiceOptionsProps = {
  variant: ChoiceVariant
  options: ChoiceOption[]
  onChange: (options: ChoiceOption[]) => void
  mode: EditMode
}

/**
 * The options and the correct mark: a radio per option (one answer), a checkbox (several), or the two fixed
 * true/false options. The last option cannot be removed. In `wording` mode only the option texts change.
 */
export function ChoiceOptions({ variant, options, onChange, mode }: ChoiceOptionsProps) {
  const id = useId()
  const editable = mode === 'all'
  const focusNew = useFocusNew<ChoiceOption>(option => option.id)
  const patch = (at: number, change: Partial<ChoiceOption>) =>
    onChange(options.map((option, index) => (index === at ? { ...option, ...change } : option)))
  const correct = options.find(option => option.is_correct)?.id ?? ''

  const row = (option: ChoiceOption, at: number, mark: ReactNode) => (
    <div key={option.id} ref={focusNew.ref(option)} className="flex items-center gap-2">
      {mark}
      <Input
        aria-label={m.assessments_option_text({ number: at + 1 })}
        placeholder={m.assessments_option_text({ number: at + 1 })}
        value={option.text ?? ''}
        disabled={mode === 'none'}
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

  return (
    <FieldSet>
      <FieldLegend id={`${id}-legend`} variant="label">
        {variant === 'true_false' ? m.assessments_correct_legend() : m.assessments_options_legend()}
      </FieldLegend>
      {variant === 'true_false' || !editable ? null : (
        <FieldDescription>
          {variant === 'multiple_choice' ? m.assessments_options_hint_multiple() : m.assessments_options_hint_single()}
        </FieldDescription>
      )}
      {variant === 'multiple_choice' ? (
        <div className="flex flex-col gap-2">{options.map((option, at) => row(option, at, checkbox(option, at)))}</div>
      ) : (
        <RadioGroup
          aria-labelledby={`${id}-legend`}
          value={correct}
          onValueChange={value => onChange(options.map(option => ({ ...option, is_correct: option.id === value })))}
        >
          {variant === 'true_false'
            ? options.map(option => trueFalse(option, id, !editable))
            : options.map((option, at) => row(option, at, radio(option, at, !editable)))}
        </RadioGroup>
      )}
      {variant === 'true_false' || !editable ? null : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...options, focusNew.added(newOption())])}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {m.assessments_option_add()}
          </Button>
        </div>
      )}
    </FieldSet>
  )
}
