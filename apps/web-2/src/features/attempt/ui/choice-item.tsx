import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentId, ChoiceBody, ItemAnswer } from '#/shared/api/gen/types.gen'
import { assessmentMediaUrl } from '#/shared/components/item-media'
import { Checkbox } from '#/shared/ui/checkbox'
import { FieldLegend, FieldSet } from '#/shared/ui/field'
import { Label } from '#/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

import { ChoiceOptionContent } from './choice-option-content'

type ChoiceProps = {
  body: ChoiceBody
  assessmentId: AssessmentId
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

// A row of the paper: the whole line is the target (a large one on a phone), the words in the reading face, the pick in
// its mark and a heavier weight. No box around an option: an exam is not a form of cards.
const OPTION =
  'flex min-h-row w-full cursor-pointer items-center gap-3 py-3 font-reading text-base leading-snug font-normal transition-colors duration-150 hover:bg-muted/50 has-data-checked:font-medium has-[:disabled,[data-disabled]]:cursor-not-allowed has-[:disabled,[data-disabled]]:opacity-60'
const LEGEND = 'font-normal text-muted-foreground'

/** Single choice and true / false: radios; multiple choice: checkboxes (B-ATT-07). Options in the server's order. */
export function ChoiceItem({ body, assessmentId, answer, onChange, disabled }: ChoiceProps) {
  const id = useId()
  const selected = answer?.kind === 'choice' ? (answer.selected ?? []) : []
  const options = body.options ?? []
  const multiple = body.multiple === true || body.variant === 'multiple_choice'
  const pick = (next: string[]) => onChange({ kind: 'choice', selected: next })
  const src = (uploadId: string) => assessmentMediaUrl(assessmentId, uploadId)
  const legend = (
    <FieldLegend id={`${id}-legend`} variant="label" className={LEGEND}>
      {multiple ? m.attempt_choose_many() : m.attempt_choose_one()}
    </FieldLegend>
  )
  if (!multiple)
    return (
      <FieldSet className="gap-0">
        {legend}
        <RadioGroup
          value={selected[0] ?? ''}
          onValueChange={value => pick([String(value)])}
          aria-labelledby={`${id}-legend`}
          disabled={disabled}
          className="gap-0 divide-y border-y"
        >
          {options.map((option, index) => (
            <Label key={option.id} htmlFor={`${id}-${option.id}`} className={OPTION}>
              <RadioGroupItem id={`${id}-${option.id}`} value={option.id} />
              <ChoiceOptionContent option={option} number={index + 1} src={src} />
            </Label>
          ))}
        </RadioGroup>
      </FieldSet>
    )
  return (
    <FieldSet className="gap-0">
      {legend}
      <div className="flex flex-col divide-y border-y">
        {options.map((option, index) => (
          <Label key={option.id} htmlFor={`${id}-${option.id}`} className={OPTION}>
            <Checkbox
              id={`${id}-${option.id}`}
              checked={selected.includes(option.id)}
              disabled={disabled}
              onCheckedChange={checked =>
                pick(checked ? [...selected, option.id] : selected.filter(value => value !== option.id))
              }
            />
            <ChoiceOptionContent option={option} number={index + 1} src={src} />
          </Label>
        ))}
      </div>
    </FieldSet>
  )
}
