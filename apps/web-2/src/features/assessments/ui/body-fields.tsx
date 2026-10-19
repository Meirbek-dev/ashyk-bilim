import { m } from '#/paraglide/messages'
import type { ItemBody } from '#/shared/api/gen/types.gen'

import type { EditMode } from '../model/route'
import { ChoiceFields } from './choice-fields'
import { CodeSummary } from './code-summary'
import { FormFields } from './form-fields'
import { MarkdownField } from './markdown-field'
import { MatchingFields } from './matching-fields'
import { OpenTextFields } from './open-text-fields'

type BodyFieldsProps = { body: ItemBody; onChange: (body: ItemBody) => void; mode: EditMode }

/** The kind-specific part of a question: the prompt (markdown) and the editor of its kind. */
export function BodyFields({ body, onChange, mode }: BodyFieldsProps) {
  const prompt =
    body.kind === 'code' ? null : (
      <MarkdownField
        label={m.assessments_field_prompt()}
        value={body.prompt ?? ''}
        onChange={text => onChange({ ...body, prompt: text })}
        editable={mode !== 'none'}
      />
    )
  return (
    <div className="flex flex-col gap-4">
      {prompt}
      {body.kind === 'choice' ? <ChoiceFields body={body} onChange={onChange} mode={mode} /> : null}
      {body.kind === 'matching' && 'pairs' in body ? (
        <MatchingFields body={body} onChange={onChange} mode={mode} />
      ) : null}
      {body.kind === 'open_text' ? <OpenTextFields body={body} onChange={onChange} mode={mode} /> : null}
      {body.kind === 'form' ? <FormFields body={body} onChange={onChange} mode={mode} /> : null}
      {body.kind === 'code' ? <CodeSummary body={body} /> : null}
    </div>
  )
}
