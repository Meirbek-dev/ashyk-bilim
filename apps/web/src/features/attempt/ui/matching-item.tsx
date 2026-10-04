import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { ItemAnswer, MatchingLearnerBody } from '#/shared/api/gen/types.gen'
import { Field, FieldGroup, FieldLabel } from '#/shared/ui/field'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

type MatchingProps = {
  body: MatchingLearnerBody
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

/** Matching: each left element gets a pick from the right column (shuffled by the server, never the pairing). */
export function MatchingItem({ body, answer, onChange, disabled }: MatchingProps) {
  const id = useId()
  const matches = answer?.kind === 'matching' ? (answer.matches ?? []) : []
  const pick = (left: string, right: string) => {
    const others = matches.filter(match => match.left !== left)
    onChange({ kind: 'matching', matches: right ? [...others, { left, right }] : others })
  }
  return (
    <FieldGroup>
      {body.left.map(left => (
        <Field key={left.id}>
          <FieldLabel htmlFor={`${id}-${left.id}`} className="wrap-anywhere">
            {left.text}
          </FieldLabel>
          <NativeSelect
            id={`${id}-${left.id}`}
            className="w-full"
            value={matches.find(match => match.left === left.id)?.right ?? ''}
            disabled={disabled}
            onChange={event => pick(left.id, event.target.value)}
          >
            <NativeSelectOption value="">{m.attempt_match_pick()}</NativeSelectOption>
            {body.right.map(right => (
              <NativeSelectOption key={right.id} value={right.id}>
                {right.text}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ))}
    </FieldGroup>
  )
}
