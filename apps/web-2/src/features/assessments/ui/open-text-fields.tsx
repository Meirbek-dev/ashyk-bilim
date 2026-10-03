import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { OpenTextBody } from '#/shared/api/gen/types.gen'
import { Field, FieldDescription, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'

import { MarkdownField } from './markdown-field'

type OpenText = OpenTextBody & { kind: 'open_text' }
type OpenTextFieldsProps = { body: OpenText; onChange: (body: OpenText) => void; editable: boolean }

/** Typed digits as `min_words` (other characters are dropped); blank is "no minimum". */
function minWords(text: string): number | null {
  const digits = text.replaceAll(/\D/gu, '')
  return digits === '' ? null : Number(digits)
}

/** An open answer: the minimum of words and the rubric the grader reads (markdown). */
export function OpenTextFields({ body, onChange, editable }: OpenTextFieldsProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={id}>{m.assessments_field_min_words()}</FieldLabel>
        <Input
          id={id}
          inputMode="numeric"
          className="max-w-32"
          aria-describedby={`${id}-hint`}
          value={body.min_words === null ? '' : String(body.min_words)}
          disabled={!editable}
          onChange={event => onChange({ ...body, min_words: minWords(event.target.value) })}
        />
        <FieldDescription id={`${id}-hint`}>{m.assessments_field_min_words_hint()}</FieldDescription>
      </Field>
      <MarkdownField
        label={m.assessments_field_rubric()}
        value={body.rubric ?? ''}
        onChange={rubric => onChange({ ...body, rubric: rubric || null })}
        editable={editable}
      />
    </div>
  )
}
