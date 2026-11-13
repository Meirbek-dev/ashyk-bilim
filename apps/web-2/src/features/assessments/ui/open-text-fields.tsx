import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { OpenTextBody } from '#/shared/api/gen/types.gen'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { Label } from '#/shared/ui/label'
import { Switch } from '#/shared/ui/switch'

import type { EditMode } from '../model/route'
import { MarkdownField } from './markdown-field'
import { TextList } from './text-list'

type OpenText = OpenTextBody & { kind: 'open_text' }
type OpenTextFieldsProps = { body: OpenText; onChange: (body: OpenText) => void; mode: EditMode }

/** Typed digits as `min_words` (other characters are dropped); blank is "no minimum". */
function minWords(text: string): number | null {
  const digits = text.replaceAll(/\D/gu, '')
  return digits === '' ? null : Number(digits)
}

/**
 * An open answer: graded by a teacher (the minimum of words and the rubric the grader reads), or a short answer the
 * server checks against the accepted answers (trimmed, spaces collapsed, numbers as numbers, the case when asked).
 * Both are the answer key: `wording` mode keeps them read-only, except the rubric.
 */
export function OpenTextFields({ body, onChange, mode }: OpenTextFieldsProps) {
  const id = useId()
  const editable = mode === 'all'
  const short = body.short_answer === true
  return (
    <div className="flex flex-col gap-4">
      <Field orientation="horizontal">
        <Switch
          id={`${id}-short`}
          checked={short}
          disabled={!editable}
          aria-describedby={`${id}-short-hint`}
          onCheckedChange={checked =>
            onChange({
              ...body,
              short_answer: checked,
              // The first accepted answer is typed at once.
              accepted_answers: checked && !body.accepted_answers?.length ? [''] : body.accepted_answers,
            })
          }
        />
        <div className="flex flex-col gap-0.5">
          <FieldLabel htmlFor={`${id}-short`}>{m.assessments_short_answer()}</FieldLabel>
          <FieldDescription id={`${id}-short-hint`}>{m.assessments_short_answer_hint()}</FieldDescription>
        </div>
      </Field>
      {short ? (
        <TextList
          legend={m.assessments_accepted_legend()}
          hint={m.assessments_accepted_hint()}
          values={body.accepted_answers ?? []}
          onChange={accepted => onChange({ ...body, accepted_answers: accepted })}
          rowLabel={number => m.assessments_accepted_row({ number })}
          removeLabel={number => m.assessments_accepted_remove({ number })}
          addLabel={m.assessments_accepted_add()}
          editable={editable}
        >
          <Label className="font-normal">
            <Checkbox
              checked={body.case_sensitive === true}
              disabled={!editable}
              onCheckedChange={checked => onChange({ ...body, case_sensitive: checked })}
            />
            {m.assessments_case_sensitive()}
          </Label>
        </TextList>
      ) : (
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
      )}
      <MarkdownField
        label={m.assessments_field_rubric()}
        value={body.rubric ?? ''}
        onChange={rubric => onChange({ ...body, rubric: rubric || null })}
        editable={mode !== 'none'}
      />
    </div>
  )
}
