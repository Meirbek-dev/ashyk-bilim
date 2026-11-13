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

// «Без пары» in the select; stored as an empty right value, which the grader reads as «left unplaced» (DOT `k-0`).
const NONE = '__no_match__'

const selectValue = (right: string | undefined) => {
  if (right === undefined) return ''
  return right === '' ? NONE : right
}

/**
 * Matching: each left element gets a pick from the right column (shuffled by the server, never the pairing). The right
 * column may hold extra values, and a left element may have no pair: «Без пары» is a pick of its own, so a question
 * with such an element can be answered in full, while the placeholder still means «not answered yet».
 */
export function MatchingItem({ body, answer, onChange, disabled }: MatchingProps) {
  const id = useId()
  const matches = answer?.kind === 'matching' ? (answer.matches ?? []) : []
  const pick = (left: string, right: string) => {
    const others = matches.filter(match => match.left !== left)
    const chosen = right === NONE ? '' : right
    onChange({ kind: 'matching', matches: right ? [...others, { left, right: chosen }] : others })
  }
  return (
    <FieldGroup>
      {body.left.map(left => (
        <Field key={left.id}>
          <FieldLabel
            htmlFor={`${id}-${left.id}`}
            className="font-reading text-base font-normal wrap-anywhere whitespace-pre-wrap"
          >
            {left.text}
          </FieldLabel>
          <NativeSelect
            id={`${id}-${left.id}`}
            className="w-full"
            value={selectValue(matches.find(match => match.left === left.id)?.right)}
            disabled={disabled}
            onChange={event => pick(left.id, event.target.value)}
          >
            <NativeSelectOption value="">{m.attempt_match_pick()}</NativeSelectOption>
            <NativeSelectOption value={NONE}>{m.attempt_match_none()}</NativeSelectOption>
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
