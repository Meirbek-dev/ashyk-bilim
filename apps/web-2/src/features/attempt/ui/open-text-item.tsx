import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { ItemAnswer, OpenTextBody } from '#/shared/api/gen/types.gen'
import { Field, FieldDescription, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { Textarea } from '#/shared/ui/textarea'

type OpenTextProps = {
  body: OpenTextBody
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

/**
 * A free-text answer; the author's minimum word count is a hint with a live count, the teacher grades it. A short
 * answer (a word or a number, graded automatically) is one line.
 */
export function OpenTextItem({ body, answer, onChange, disabled }: OpenTextProps) {
  const id = useId()
  const text = answer?.kind === 'open_text' ? (answer.text ?? '') : ''
  if (body.short_answer)
    return (
      <Field>
        <FieldLabel htmlFor={id}>{m.attempt_your_answer()}</FieldLabel>
        <Input
          id={id}
          value={text}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          onChange={event => onChange({ kind: 'open_text', text: event.target.value })}
        />
      </Field>
    )
  // With a minimum, the learner sees how far they are (nothing checks it before the teacher does).
  const words = text.split(/\s+/).filter(Boolean).length
  return (
    <Field>
      <FieldLabel htmlFor={id}>{m.attempt_your_answer()}</FieldLabel>
      <Textarea
        id={id}
        // The kit's textarea sizes to its content (`rows` is ignored): an essay starts with room to write.
        className="min-h-48"
        rows={8}
        value={text}
        disabled={disabled}
        onChange={event => onChange({ kind: 'open_text', text: event.target.value })}
      />
      {body.min_words ? (
        <FieldDescription className="tabular-nums">
          {m.attempt_min_words({ count: body.min_words })} · {m.attempt_word_count({ count: words })}
        </FieldDescription>
      ) : null}
    </Field>
  )
}
