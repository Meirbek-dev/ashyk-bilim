import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { ItemAnswer, OpenTextBody } from '#/shared/api/gen/types.gen'
import { Field, FieldDescription, FieldLabel } from '#/shared/ui/field'
import { Textarea } from '#/shared/ui/textarea'

type OpenTextProps = {
  body: OpenTextBody
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

/** A free-text answer; the author's minimum word count is a hint, the teacher grades it. */
export function OpenTextItem({ body, answer, onChange, disabled }: OpenTextProps) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{m.attempt_your_answer()}</FieldLabel>
      <Textarea
        id={id}
        rows={8}
        value={answer?.kind === 'open_text' ? (answer.text ?? '') : ''}
        disabled={disabled}
        onChange={event => onChange({ kind: 'open_text', text: event.target.value })}
      />
      {body.min_words ? <FieldDescription>{m.attempt_min_words({ count: body.min_words })}</FieldDescription> : null}
    </Field>
  )
}
